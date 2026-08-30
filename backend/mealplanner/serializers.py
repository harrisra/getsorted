from rest_framework import serializers
from rest_framework.reverse import reverse

from catalog.models import GroceryItem
from .models import MealPlan, MealSlot, Recipe, RecipeIngredient, ShoppingListItem


class GroceryItemSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = GroceryItem
        fields = ["id", "store", "name", "image_url", "price"]


class RecipeIngredientSerializer(serializers.ModelSerializer):
    grocery_item_detail = GroceryItemSummarySerializer(source="grocery_item", read_only=True)

    class Meta:
        model = RecipeIngredient
        fields = ["id", "name", "quantity", "grocery_item", "grocery_item_detail"]


class RecipeSerializer(serializers.ModelSerializer):
    ingredients = RecipeIngredientSerializer(many=True, required=False)
    current_cost = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()

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
            "image",
            "ingredients",
            "current_cost",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["created_by", "created_at"]

    def get_current_cost(self, recipe):
        cost = recipe.current_cost
        return str(cost) if cost is not None else None

    def get_image(self, recipe):
        if not recipe.image_data:
            return None
        return reverse("recipe-image", kwargs={"pk": recipe.pk}, request=self.context.get("request"))

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


class RecipeSummarySerializer(serializers.ModelSerializer):
    current_cost = serializers.SerializerMethodField()

    class Meta:
        model = Recipe
        fields = ["id", "name", "meal_type", "servings", "current_cost"]

    def get_current_cost(self, recipe):
        cost = recipe.current_cost
        return str(cost) if cost is not None else None


class MealSlotSerializer(serializers.ModelSerializer):
    recipes_detail = RecipeSummarySerializer(source="recipes", many=True, read_only=True)

    class Meta:
        model = MealSlot
        fields = ["id", "meal_plan", "date", "meal_type", "recipes", "recipes_detail", "notes"]

    def validate(self, attrs):
        recipes = attrs.get("recipes")
        if recipes:
            meal_plan = attrs.get("meal_plan") or (self.instance and self.instance.meal_plan)
            household_id = meal_plan.household_id if meal_plan else None
            mismatched = [r for r in recipes if r.household_id != household_id]
            if mismatched:
                raise serializers.ValidationError(
                    {"recipes": "Recipes must belong to the same household as this meal plan."}
                )
        return attrs


class MealPlanSerializer(serializers.ModelSerializer):
    slots = MealSlotSerializer(many=True, read_only=True)
    total_cost = serializers.SerializerMethodField()
    daily_totals = serializers.SerializerMethodField()

    class Meta:
        model = MealPlan
        fields = [
            "id",
            "household",
            "week_start",
            "created_at",
            "slots",
            "total_cost",
            "daily_totals",
        ]
        read_only_fields = ["created_at"]

    def _costs_by_date(self, meal_plan):
        costs_by_date: dict = {}
        for slot in meal_plan.slots.all():
            costs_by_date.setdefault(slot.date, [])
            for recipe in slot.recipes.all():
                if recipe.current_cost is not None:
                    costs_by_date[slot.date].append(recipe.current_cost)
        return costs_by_date

    def get_daily_totals(self, meal_plan):
        return [
            {"date": date.isoformat(), "total_cost": str(sum(costs)) if costs else None}
            for date, costs in sorted(self._costs_by_date(meal_plan).items())
        ]

    def get_total_cost(self, meal_plan):
        all_costs = [cost for costs in self._costs_by_date(meal_plan).values() for cost in costs]
        return str(sum(all_costs)) if all_costs else None


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
