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
    Essentials,
    MealPlan,
    MealSlot,
    MealType,
    Recipe,
    ShoppingList,
    ShoppingListItem,
)
from .permissions import IsHouseholdMember
from .serializers import (
    EssentialsSerializer,
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
        "ingredients__grocery_matches",
        "ingredients__grocery_matches__grocery_item",
        "ingredients__grocery_matches__grocery_item__store_prices",
        "ingredients__grocery_matches__grocery_item__store_prices__store",
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


class EssentialsViewSet(HouseholdScopedViewSet):
    """A household's recurring, non-meal grocery groupings (see
    mealplanner.Essentials) — any household member can view/edit/delete,
    same as ShoppingList/MealPlan rather than Recipe's creator-restricted
    delete, since there's no "who cooked this" ownership angle here."""

    queryset = Essentials.objects.prefetch_related(
        "items",
        "items__grocery_matches",
        "items__grocery_matches__grocery_item",
        "items__grocery_matches__grocery_item__store_prices",
        "items__grocery_matches__grocery_item__store_prices__store",
    )
    serializer_class = EssentialsSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class MealPlanViewSet(HouseholdScopedViewSet):
    queryset = MealPlan.objects.prefetch_related(
        "slots",
        "slots__recipes",
        "slots__recipes__ingredients",
        "slots__recipes__ingredients__grocery_matches",
        "slots__recipes__ingredients__grocery_matches__grocery_item",
        "slots__recipes__ingredients__grocery_matches__grocery_item__store_prices",
        "slots__recipes__ingredients__grocery_matches__grocery_item__store_prices__store",
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
        "recipes__ingredients__grocery_matches",
        "recipes__ingredients__grocery_matches__grocery_item",
        "recipes__ingredients__grocery_matches__grocery_item__store_prices",
        "recipes__ingredients__grocery_matches__grocery_item__store_prices__store",
    )
    serializer_class = MealSlotSerializer
    household_lookup = "meal_plan__household__members"


def add_or_merge_shopping_list_item(
    shopping_list, name, grams, pieces, milliliters, meal_plan_id, user, grocery_item_price=None
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
        # chose (or set one on an item that deliberately had none). A manual
        # packs_override IS cleared when the needed amount actually grows,
        # though — it was set for the old amount, so keeping it would
        # silently understate how many packs are really needed now.
        if grams or pieces or milliliters:
            existing.packs_override = None
        existing.save(
            update_fields=["grams", "pieces", "milliliters", "meal_plan", "packs_override"]
        )
        return existing, False

    item = ShoppingListItem.objects.create(
        shopping_list=shopping_list,
        meal_plan_id=meal_plan_id,
        name=name,
        grams=grams,
        pieces=pieces,
        milliliters=milliliters,
        grocery_item_price=grocery_item_price,
        added_by=user,
    )
    return item, True


def add_grouped_items_to_shopping_list(shopping_list, entries, excluded_store_ids, user):
    """Add every (item, meal_plan_id) pair in `entries` to shopping_list, one
    line per distinct name — shared by ShoppingListViewSet.generate (sourced
    from planned recipes) and .add_essentials (sourced from an Essentials
    group). `item` is anything shaped like RecipeIngredient/EssentialsItem
    (see models.QuantityMatchMixin): `.name`, `.grams`, `.pieces`,
    `.milliliters`, `.store_costs`.

    Amounts across every entry sharing a name (case/whitespace-insensitive)
    are summed together, and the resulting line's match defaults to
    whichever non-excluded store is cheapest across all of them — same rule
    reoptimize_item_stores applies for an already-generated item. Returns
    the affected ShoppingListItems.
    """
    groups = {}
    for item, meal_plan_id in entries:
        key = item.name.strip().lower()
        groups.setdefault(key, []).append((item, meal_plan_id))

    affected = []
    for group_entries in groups.values():
        display_name = group_entries[0][0].name.strip()
        grams = sum(i.grams or 0 for i, _ in group_entries) or None
        pieces = sum(i.pieces or 0 for i, _ in group_entries) or None
        milliliters = sum(i.milliliters or 0 for i, _ in group_entries) or None
        # Only link a single originating meal_plan when every occurrence of
        # this name came from the same one — otherwise leave it unlinked
        # rather than pointing at an arbitrary one of several (an Essentials
        # item always passes meal_plan_id=None, so a name shared between a
        # recipe and an Essentials group also ends up unlinked here).
        meal_plan_ids = {mp_id for _, mp_id in group_entries}
        meal_plan_id = meal_plan_ids.pop() if len(meal_plan_ids) == 1 else None

        # Default the matched product+store to whichever is cheapest across
        # every item contributing to this line — so a generated item shows
        # a cost straight away instead of only after the user re-picks a
        # product from the dropdown. Only ever set on create; merging into
        # an existing item never touches its match (see
        # add_or_merge_shopping_list_item). Stores this list has excluded
        # are never picked here, even if cheaper.
        priced_options = [
            (price_row, cost)
            for i, _ in group_entries
            for price_row, cost in i.store_costs
            if price_row.store_id not in excluded_store_ids
        ]
        grocery_item_price = (
            min(priced_options, key=lambda pair: pair[1])[0] if priced_options else None
        )

        item, _created = add_or_merge_shopping_list_item(
            shopping_list,
            display_name,
            grams,
            pieces,
            milliliters,
            meal_plan_id,
            user,
            grocery_item_price=grocery_item_price,
        )
        affected.append(item)
    return affected


class ShoppingListViewSet(HouseholdScopedViewSet):
    """A household can have several shopping lists going at once (e.g.
    "This week", "Costco run")."""

    queryset = ShoppingList.objects.prefetch_related("excluded_stores")
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
            "recipes__ingredients__grocery_matches__grocery_item__store_prices__store",
        )

        # Stores this list isn't buying from — a generated item should never
        # default to one of these, same as reoptimize_item_stores respects
        # this set for an already-generated item whose stores change later.
        excluded_store_ids = set(shopping_list.excluded_stores.values_list("id", flat=True))

        entries = [
            (ingredient, slot.meal_plan_id)
            for slot in slots
            for recipe in slot.recipes.all()
            for ingredient in recipe.ingredients.all()
        ]
        affected = add_grouped_items_to_shopping_list(
            shopping_list, entries, excluded_store_ids, request.user
        )

        serializer = ShoppingListItemSerializer(affected, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="add-essentials")
    def add_essentials(self, request, pk=None):
        """Add items to this list from one or more of the household's
        Essentials groups (see mealplanner.Essentials) — same merge-by-name
        and cheapest-non-excluded-store defaulting as generate, just sourced
        from a standing Essentials group instead of a dated meal plan (so
        there's no meal_plan to link a resulting item to).
        """
        shopping_list = self.get_object()
        essentials_ids = request.data.get("essentials_ids")
        if not isinstance(essentials_ids, list) or not essentials_ids:
            raise ValidationError(
                {"essentials_ids": ["A non-empty list of essentials ids is required."]}
            )

        essentials_qs = Essentials.objects.filter(
            household=shopping_list.household, id__in=essentials_ids
        ).prefetch_related(
            "items__grocery_matches__grocery_item__store_prices__store",
        )
        found_ids = {str(e.id) for e in essentials_qs}
        missing = [str(i) for i in essentials_ids if str(i) not in found_ids]
        if missing:
            raise ValidationError(
                {"essentials_ids": [f"Not found in this household: {', '.join(missing)}."]}
            )

        excluded_store_ids = set(shopping_list.excluded_stores.values_list("id", flat=True))
        entries = [
            (item, None) for essentials in essentials_qs for item in essentials.items.all()
        ]
        affected = add_grouped_items_to_shopping_list(
            shopping_list, entries, excluded_store_ids, request.user
        )

        serializer = ShoppingListItemSerializer(affected, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ShoppingListItemViewSet(HouseholdScopedViewSet):
    queryset = ShoppingListItem.objects.select_related(
        "grocery_item_price", "grocery_item_price__store", "grocery_item_price__grocery_item"
    )
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
            grocery_item_price=data.get("grocery_item_price"),
        )
        out_serializer = self.get_serializer(item)
        return Response(
            out_serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
