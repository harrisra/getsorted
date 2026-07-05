from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import MealPlan, MealSlot, Recipe, ShoppingListItem
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
    queryset = Recipe.objects.all()
    serializer_class = RecipeSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class MealPlanViewSet(HouseholdScopedViewSet):
    queryset = MealPlan.objects.all()
    serializer_class = MealPlanSerializer


class MealSlotViewSet(HouseholdScopedViewSet):
    queryset = MealSlot.objects.all()
    serializer_class = MealSlotSerializer
    household_lookup = "meal_plan__household__members"


class ShoppingListItemViewSet(HouseholdScopedViewSet):
    queryset = ShoppingListItem.objects.all()
    serializer_class = ShoppingListItemSerializer

    def perform_create(self, serializer):
        serializer.save(added_by=self.request.user)
