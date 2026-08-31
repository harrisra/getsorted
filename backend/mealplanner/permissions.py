from rest_framework.permissions import BasePermission


class IsHouseholdMember(BasePermission):
    """Allows access only to objects whose household includes the current user."""

    def has_object_permission(self, request, view, obj):
        # Recipe/MealPlan/ShoppingList have `household` directly; MealSlot
        # reaches it via `meal_plan`; ShoppingListItem via `shopping_list`
        # (its own `meal_plan` is optional and often None). Nested getattr
        # with a None default at each step keeps this safe either way.
        household = (
            getattr(obj, "household", None)
            or getattr(getattr(obj, "meal_plan", None), "household", None)
            or getattr(getattr(obj, "shopping_list", None), "household", None)
        )
        return bool(household) and household.members.filter(pk=request.user.pk).exists()
