from rest_framework import serializers

from .models import MealPlan, MealSlot, Recipe, ShoppingListItem


class RecipeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recipe
        fields = ["id", "household", "name", "instructions", "servings", "created_by", "created_at"]
        read_only_fields = ["created_by", "created_at"]


class MealSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = MealSlot
        fields = ["id", "meal_plan", "date", "meal_type", "recipe", "notes"]


class MealPlanSerializer(serializers.ModelSerializer):
    slots = MealSlotSerializer(many=True, read_only=True)

    class Meta:
        model = MealPlan
        fields = ["id", "household", "week_start", "created_at", "slots"]
        read_only_fields = ["created_at"]


class ShoppingListItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShoppingListItem
        fields = [
            "id",
            "household",
            "meal_plan",
            "name",
            "quantity",
            "is_checked",
            "added_by",
            "created_at",
        ]
        read_only_fields = ["added_by", "created_at"]
