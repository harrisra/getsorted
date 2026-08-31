import io
from datetime import date, timedelta
from itertools import product

from django.http import Http404, HttpResponse
from PIL import Image, UnidentifiedImageError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Household, Membership
from .models import (
    MAX_RECIPE_IMAGE_MB,
    MealPlan,
    MealSlot,
    MealType,
    Recipe,
    ShoppingList,
    ShoppingListItem,
)
from .permissions import IsHouseholdMember
from .serializers import (
    MealPlanSerializer,
    MealSlotSerializer,
    RecipeSerializer,
    ShoppingListItemSerializer,
    ShoppingListSerializer,
)


class HouseholdScopedViewSet(viewsets.ModelViewSet):
    """Base viewset that scopes all queries to the current user's households."""

    permission_classes = [IsAuthenticated, IsHouseholdMember]
    household_lookup = "household__members"

    def get_queryset(self):
        return super().get_queryset().filter(**{self.household_lookup: self.request.user})


class RecipeViewSet(HouseholdScopedViewSet):
    queryset = Recipe.objects.prefetch_related(
        "ingredients",
        "ingredients__store_options",
        "ingredients__store_options__grocery_item",
        "ingredients__store_options__grocery_item__store",
    ).all()
    serializer_class = RecipeSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        is_creator = instance.created_by_id == self.request.user.id
        is_household_owner = Membership.objects.filter(
            household=instance.household, user=self.request.user, role=Membership.Role.OWNER
        ).exists()
        if not (is_creator or is_household_owner):
            raise PermissionDenied(
                "Only the recipe's creator or a household owner can delete it."
            )
        instance.delete()

    @action(
        detail=True,
        methods=["get", "put", "delete"],
        url_path="image",
        parser_classes=[MultiPartParser, FormParser],
    )
    def image(self, request, pk=None):
        recipe = self.get_object()

        if request.method == "GET":
            if not recipe.image_data:
                raise Http404
            return HttpResponse(bytes(recipe.image_data), content_type=recipe.image_content_type)

        if request.method == "DELETE":
            recipe.image_data = None
            recipe.image_content_type = ""
            recipe.save(update_fields=["image_data", "image_content_type"])
            return Response(status=status.HTTP_204_NO_CONTENT)

        file = request.data.get("image")
        if not file:
            raise ValidationError({"image": ["No file provided."]})
        if file.size > MAX_RECIPE_IMAGE_MB * 1024 * 1024:
            raise ValidationError(
                {"image": [f"Image must be smaller than {MAX_RECIPE_IMAGE_MB}MB."]}
            )

        data = file.read()
        try:
            img = Image.open(io.BytesIO(data))
            img.verify()
        except UnidentifiedImageError as exc:
            raise ValidationError({"image": ["Not a valid image file."]}) from exc
        content_type = Image.MIME.get(img.format, file.content_type or "application/octet-stream")

        recipe.image_data = data
        recipe.image_content_type = content_type
        recipe.save(update_fields=["image_data", "image_content_type"])
        return Response(self.get_serializer(recipe).data)


class MealPlanViewSet(HouseholdScopedViewSet):
    queryset = MealPlan.objects.prefetch_related(
        "slots",
        "slots__recipes",
        "slots__recipes__ingredients",
        "slots__recipes__ingredients__store_options",
        "slots__recipes__ingredients__store_options__grocery_item",
    )
    serializer_class = MealPlanSerializer

    @action(detail=False, methods=["get"], url_path="for-week")
    def for_week(self, request):
        """Fetch (auto-creating if needed) the household's plan for a given week.

        Always ensures all 7 days x 4 meal types exist as MealSlot rows, so the
        frontend can render a fixed grid without special-casing missing cells.
        """
        household_id = request.query_params.get("household")
        week_start = request.query_params.get("week_start")
        if not household_id or not week_start:
            raise ValidationError(
                {"detail": "household and week_start query params are required."}
            )

        household = get_object_or_404(Household, pk=household_id, members=request.user)

        try:
            week_start_date = date.fromisoformat(week_start)
        except ValueError as exc:
            raise ValidationError({"week_start": ["Must be in YYYY-MM-DD format."]}) from exc

        if week_start_date.weekday() != household.week_start_day:
            raise ValidationError(
                {"week_start": ["Does not match this household's configured week-start day."]}
            )

        meal_plan, _ = MealPlan.objects.get_or_create(
            household=household, week_start=week_start_date
        )
        for offset, meal_type in product(range(7), MealType.values):
            MealSlot.objects.get_or_create(
                meal_plan=meal_plan,
                date=week_start_date + timedelta(days=offset),
                meal_type=meal_type,
            )

        meal_plan = self.get_queryset().get(pk=meal_plan.pk)
        return Response(self.get_serializer(meal_plan).data)


class MealSlotViewSet(HouseholdScopedViewSet):
    queryset = MealSlot.objects.prefetch_related(
        "recipes",
        "recipes__ingredients",
        "recipes__ingredients__store_options",
        "recipes__ingredients__store_options__grocery_item",
    )
    serializer_class = MealSlotSerializer
    household_lookup = "meal_plan__household__members"


def add_or_merge_shopping_list_item(
    shopping_list, name, grams, pieces, milliliters, meal_plan_id, user, grocery_item=None
):
    """Add (name, amount) to a shopping list, merging into an existing item
    of the same name (case/whitespace-insensitive) rather than creating a
    duplicate row — the same ingredient/item wanted more than once (a
    second generate run, a second manual add) accumulates onto one line
    instead of piling up separate ones. Returns (item, created).
    """
    name = name.strip()
    existing = ShoppingListItem.objects.filter(shopping_list=shopping_list, name__iexact=name).first()
    if existing:
        existing.grams = (existing.grams or 0) + (grams or 0) or None
        existing.pieces = (existing.pieces or 0) + (pieces or 0) or None
        existing.milliliters = (existing.milliliters or 0) + (milliliters or 0) or None
        # Only keep a meal_plan link when it's still unambiguous — if this
        # merge came from a different plan than the item already had, we
        # can no longer point at just one.
        if existing.meal_plan_id != meal_plan_id:
            existing.meal_plan_id = None
        # The matched product isn't touched by a merge — combining
        # quantities shouldn't silently swap out a match someone already
        # chose (or set one on an item that deliberately had none).
        existing.save(update_fields=["grams", "pieces", "milliliters", "meal_plan"])
        return existing, False

    item = ShoppingListItem.objects.create(
        shopping_list=shopping_list,
        meal_plan_id=meal_plan_id,
        name=name,
        grams=grams,
        pieces=pieces,
        milliliters=milliliters,
        grocery_item=grocery_item,
        added_by=user,
    )
    return item, True


class ShoppingListViewSet(HouseholdScopedViewSet):
    """A household can have several shopping lists going at once (e.g.
    "This week", "Costco run")."""

    queryset = ShoppingList.objects.all()
    serializer_class = ShoppingListSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="generate")
    def generate(self, request, pk=None):
        """Add items to this list built from the recipes planned on the
        given dates. One line per distinct ingredient name across every
        selected day's planned recipes, amounts summed together — and that
        merge extends to whatever's already on the list too (see
        add_or_merge_shopping_list_item): two recipes both needing
        "Cheddar" combine into one line, and so does regenerating over
        already-covered dates, rather than piling up duplicate lines.
        """
        shopping_list = self.get_object()
        dates = request.data.get("dates")
        if not isinstance(dates, list) or not dates:
            raise ValidationError({"dates": ["A non-empty list of dates is required."]})

        try:
            parsed_dates = [date.fromisoformat(d) for d in dates]
        except (TypeError, ValueError) as exc:
            raise ValidationError({"dates": ["Each date must be in YYYY-MM-DD format."]}) from exc

        slots = MealSlot.objects.filter(
            meal_plan__household=shopping_list.household, date__in=parsed_dates
        ).prefetch_related(
            "recipes__ingredients__store_options__grocery_item",
        )

        # Normalized ingredient name -> [(ingredient, meal_plan_id), ...]
        groups = {}
        for slot in slots:
            for recipe in slot.recipes.all():
                for ingredient in recipe.ingredients.all():
                    key = ingredient.name.strip().lower()
                    groups.setdefault(key, []).append((ingredient, slot.meal_plan_id))

        affected = []
        for entries in groups.values():
            display_name = entries[0][0].name.strip()
            grams = sum(ing.grams or 0 for ing, _ in entries) or None
            pieces = sum(ing.pieces or 0 for ing, _ in entries) or None
            milliliters = sum(ing.milliliters or 0 for ing, _ in entries) or None
            # Only link a single originating meal_plan when every occurrence
            # of this ingredient came from the same one — otherwise leave it
            # unlinked rather than pointing at an arbitrary one of several.
            meal_plan_ids = {mp_id for _, mp_id in entries}
            meal_plan_id = meal_plan_ids.pop() if len(meal_plan_ids) == 1 else None

            # Default the matched product to whichever store option is
            # cheapest across every ingredient contributing to this line —
            # the same match already used for the recipe's own cost
            # calculation (see RecipeIngredient.line_cost) — so a generated
            # item shows a cost straight away instead of only after the user
            # re-picks a product from the dropdown. Only ever set on create;
            # merging into an existing item never touches its match (see
            # add_or_merge_shopping_list_item).
            priced_options = [
                option
                for ingredient, _ in entries
                for option in ingredient.store_options.all()
                if option.line_cost is not None
            ]
            grocery_item = (
                min(priced_options, key=lambda option: option.line_cost).grocery_item
                if priced_options
                else None
            )

            item, _created = add_or_merge_shopping_list_item(
                shopping_list,
                display_name,
                grams,
                pieces,
                milliliters,
                meal_plan_id,
                request.user,
                grocery_item=grocery_item,
            )
            affected.append(item)

        serializer = ShoppingListItemSerializer(affected, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ShoppingListItemViewSet(HouseholdScopedViewSet):
    queryset = ShoppingListItem.objects.select_related("grocery_item", "grocery_item__store")
    serializer_class = ShoppingListItemSerializer
    household_lookup = "shopping_list__household__members"

    def create(self, request, *args, **kwargs):
        # Merges into an existing same-named item rather than always
        # inserting a new row — see add_or_merge_shopping_list_item. Bypasses
        # ModelViewSet's default create()/perform_create() since that always
        # inserts; whether this ends up being a create or a merge-update
        # isn't known until the name is checked against what's already here.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        meal_plan = data.get("meal_plan")

        item, created = add_or_merge_shopping_list_item(
            shopping_list=data["shopping_list"],
            name=data["name"],
            grams=data.get("grams"),
            pieces=data.get("pieces"),
            milliliters=data.get("milliliters"),
            meal_plan_id=meal_plan.id if meal_plan else None,
            user=request.user,
            grocery_item=data.get("grocery_item"),
        )
        out_serializer = self.get_serializer(item)
        return Response(
            out_serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
