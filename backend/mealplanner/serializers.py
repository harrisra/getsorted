from rest_framework import serializers

from catalog.models import GroceryItem
from .models import MealPlan, MealSlot, Recipe, RecipeIngredient, ShoppingListItem


class GroceryItemSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = GroceryItem
        fields = ["id", "store", "name", "image_url"]


class RecipeIngredientSerializer(serializers.ModelSerializer):
    grocery_item_detail = GroceryItemSummarySerializer(source="grocery_item", read_only=True)

    class Meta:
        model = RecipeIngredient
        fields = ["id", "name", "quantity", "grocery_item", "grocery_item_detail"]


class RecipeSerializer(serializers.ModelSerializer):
    ingredients = RecipeIngredientSerializer(many=True, required=False)

    class Meta:
        model = Recipe
        fields = [
            "id",
            "household",
            "name",
            "meal_type",
            "servings",
            "instructions",
            "source_url",
            "ingredients",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["created_by", "created_at"]

    def create(self, validated_data):
        ingredients_data = validated_data.pop("ingredients", [])
        recipe = super().create(validated_data)
        self._set_ingredients(recipe, ingredients_data)
        return recipe

    def update(self, instance, validated_data):
        ingredients_data = validated_data.pop("ingredients", None)
        recipe = super().update(instance, validated_data)
        if ingredients_data is not None:
            recipe.ingredients.all().delete()
            self._set_ingredients(recipe, ingredients_data)
        return recipe

    def _set_ingredients(self, recipe, ingredients_data):
        RecipeIngredient.objects.bulk_create(
            RecipeIngredient(recipe=recipe, **data) for data in ingredients_data
        )


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
