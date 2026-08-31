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
        selected day's planned recipes — amounts for the same ingredient
        name are summed together (e.g. two recipes both needing "Cheddar"
        combine into one line) rather than added as separate duplicate
        lines.

        This only adds new items; it doesn't try to match against — or
        dedupe with — whatever is already on the list, so regenerating over
        already-covered dates will add another round of lines rather than
        updating the earlier ones.
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
        ).prefetch_related("recipes__ingredients")

        # Normalized ingredient name -> [(ingredient, meal_plan_id), ...]
        groups = {}
        for slot in slots:
            for recipe in slot.recipes.all():
                for ingredient in recipe.ingredients.all():
                    key = ingredient.name.strip().lower()
                    groups.setdefault(key, []).append((ingredient, slot.meal_plan_id))

        created = []
        for entries in groups.values():
            display_name = entries[0][0].name.strip()
            grams = sum(ing.grams or 0 for ing, _ in entries) or None
            pieces = sum(ing.pieces or 0 for ing, _ in entries) or None
            milliliters = sum(ing.milliliters or 0 for ing, _ in entries) or None
            quantity = " + ".join(
                part
                for part in [
                    f"{grams}g" if grams else "",
                    f"{pieces}pc" if pieces else "",
                    f"{milliliters}ml" if milliliters else "",
                ]
                if part
            )
            # Only link a single originating meal_plan when every occurrence
            # of this ingredient came from the same one — otherwise leave it
            # unlinked rather than pointing at an arbitrary one of several.
            meal_plan_ids = {mp_id for _, mp_id in entries}
            meal_plan_id = meal_plan_ids.pop() if len(meal_plan_ids) == 1 else None

            created.append(
                ShoppingListItem.objects.create(
                    shopping_list=shopping_list,
                    meal_plan_id=meal_plan_id,
                    name=display_name,
                    quantity=quantity,
                    added_by=request.user,
                )
            )

        serializer = ShoppingListItemSerializer(created, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ShoppingListItemViewSet(HouseholdScopedViewSet):
    queryset = ShoppingListItem.objects.all()
    serializer_class = ShoppingListItemSerializer
    household_lookup = "shopping_list__household__members"

    def perform_create(self, serializer):
        serializer.save(added_by=self.request.user)
