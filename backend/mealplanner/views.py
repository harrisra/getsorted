from datetime import date, timedelta
from itertools import product

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Household
from .models import MealPlan, MealSlot, MealType, Recipe, ShoppingListItem
from .permissions import IsHouseholdMember
from .serializers import (
    MealPlanSerializer,
    MealSlotSerializer,
    RecipeSerializer,
    ShoppingListItemSerializer,
)


class HouseholdScopedViewSet(viewsets.ModelViewSet):
    """Base viewset that scopes all queries to the current user's households."""

    permission_classes = [IsAuthenticated, IsHouseholdMember]
    household_lookup = "household__members"

    def get_queryset(self):
        return super().get_queryset().filter(**{self.household_lookup: self.request.user})


class RecipeViewSet(HouseholdScopedViewSet):
    queryset = Recipe.objects.prefetch_related("ingredients", "ingredients__grocery_item").all()
    serializer_class = RecipeSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(
        detail=True,
        methods=["put", "delete"],
        url_path="image",
        parser_classes=[MultiPartParser, FormParser],
    )
    def image(self, request, pk=None):
        recipe = self.get_object()

        if request.method == "DELETE":
            recipe.image.delete(save=True)
            return Response(status=status.HTTP_204_NO_CONTENT)

        file = request.data.get("image")
        if not file:
            raise ValidationError({"image": ["No file provided."]})

        recipe.image.delete(save=False)
        recipe.image = file
        try:
            recipe.full_clean(validate_unique=False)
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
        recipe.save()
        return Response(self.get_serializer(recipe).data)


class MealPlanViewSet(HouseholdScopedViewSet):
    queryset = MealPlan.objects.prefetch_related(
        "slots", "slots__recipes", "slots__recipes__ingredients__grocery_item"
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
    queryset = MealSlot.objects.prefetch_related("recipes", "recipes__ingredients__grocery_item")
    serializer_class = MealSlotSerializer
    household_lookup = "meal_plan__household__members"


class ShoppingListItemViewSet(HouseholdScopedViewSet):
    queryset = ShoppingListItem.objects.all()
    serializer_class = ShoppingListItemSerializer

    def perform_create(self, serializer):
        serializer.save(added_by=self.request.user)
