from rest_framework.permissions import BasePermission


class IsHouseholdMember(BasePermission):
    """Allows access only to objects whose household includes the current user."""

    def has_object_permission(self, request, view, obj):
        household = getattr(obj, "household", None) or getattr(obj.meal_plan, "household", None)
        return household.members.filter(pk=request.user.pk).exists()
