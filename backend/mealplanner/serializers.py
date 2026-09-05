from rest_framework import serializers
from rest_framework.reverse import reverse

from catalog.models import GroceryItemPrice
from .models import (
    MealPlan,
    MealSlot,
    Recipe,
    RecipeIngredient,
    RecipeIngredientStoreOption,
    ShoppingList,
    ShoppingListItem,
)


class GroceryItemPriceSummarySerializer(serializers.ModelSerializer):
    # Read-only here (nested under a RecipeIngredientStoreOption/
    # ShoppingListItem), so just the store's name rather than the FK id, and
    # the product's own name/image rather than needing a second round trip
    # to the catalog — GroceryItemCombobox displays/searches them as plain
    # text.
    store = serializers.CharField(source="store.name", read_only=True)
    name = serializers.CharField(source="grocery_item.name", read_only=True)
    image_url = serializers.CharField(source="grocery_item.image_url", read_only=True)

    class Meta:
        model = GroceryItemPrice
        fields = ["id", "store", "name", "image_url", "price"]


class RecipeIngredientStoreOptionSerializer(serializers.ModelSerializer):
    grocery_item_price_detail = GroceryItemPriceSummarySerializer(
        source="grocery_item_price", read_only=True
    )
    line_cost = serializers.SerializerMethodField()

    class Meta:
        model = RecipeIngredientStoreOption
        fields = ["id", "store", "grocery_item_price", "grocery_item_price_detail", "line_cost"]
        read_only_fields = ["id", "store"]

    def get_line_cost(self, option):
        cost = option.line_cost
        return str(cost) if cost is not None else None


class RecipeIngredientSerializer(serializers.ModelSerializer):
    # One match per store — see RecipeIngredientStoreOption. Written as raw
    # dicts by RecipeSerializer._set_ingredients rather than through this
    # nested serializer's own create/update, same as `ingredients` itself.
    store_options = RecipeIngredientStoreOptionSerializer(many=True, required=False)
    line_cost = serializers.SerializerMethodField()

    class Meta:
        model = RecipeIngredient
        fields = [
            "id",
            "name",
            "grams",
            "pieces",
            "milliliters",
            "store_options",
            "line_cost",
        ]

    def get_line_cost(self, ingredient):
        cost = ingredient.line_cost
        return str(cost) if cost is not None else None

    def validate(self, attrs):
        def value(field):
            return attrs.get(field, getattr(self.instance, field, None) if self.instance else None)

        if value("grams") is None and value("pieces") is None and value("milliliters") is None:
            raise serializers.ValidationError("Provide grams, pieces, and/or milliliters.")

        store_options = attrs.get("store_options")
        if store_options:
            store_ids = [opt["grocery_item_price"].store_id for opt in store_options]
            if len(store_ids) != len(set(store_ids)):
                raise serializers.ValidationError(
                    {"store_options": "Only one grocery item match is allowed per store."}
                )
        return attrs


class RecipeImageMixin:
    def get_image(self, recipe):
        """The effective photo to display: an uploaded image wins if present,
        otherwise the externally-hosted image_url, otherwise none."""
        if recipe.image_data:
            return reverse("recipe-image", kwargs={"pk": recipe.pk}, request=self.context.get("request"))
        return recipe.image_url or None


class RecipeSerializer(RecipeImageMixin, serializers.ModelSerializer):
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
            "image_url",
            "ingredients",
            "current_cost",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["created_by", "created_at"]

    def get_current_cost(self, recipe):
        cost = recipe.current_cost
        return str(cost) if cost is not None else None

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
        ingredients = []
        options = []
        for data in ingredients_data:
            store_options_data = data.pop("store_options", [])
            ingredient = RecipeIngredient(recipe=recipe, **data)
            ingredients.append(ingredient)
            for opt in store_options_data:
                grocery_item_price = opt["grocery_item_price"]
                options.append(
                    RecipeIngredientStoreOption(
                        recipe_ingredient=ingredient,
                        grocery_item_price=grocery_item_price,
                        store_id=grocery_item_price.store_id,
                    )
                )
        # Ingredients first — the options' FK needs their (UUID, so already
        # client-side generated) ids to already exist as rows.
        RecipeIngredient.objects.bulk_create(ingredients)
        RecipeIngredientStoreOption.objects.bulk_create(options)


class RecipeSummarySerializer(RecipeImageMixin, serializers.ModelSerializer):
    current_cost = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()

    class Meta:
        model = Recipe
        fields = ["id", "name", "meal_type", "servings", "current_cost", "image"]

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


class ShoppingListSerializer(serializers.ModelSerializer):
    created_by_email = serializers.SerializerMethodField()
    item_count = serializers.IntegerField(source="items.count", read_only=True)

    class Meta:
        model = ShoppingList
        fields = ["id", "household", "name", "item_count", "created_by", "created_by_email", "created_at"]
        read_only_fields = ["created_by", "created_at"]

    def get_created_by_email(self, obj):
        return obj.created_by.email if obj.created_by else None


class ShoppingListItemSerializer(serializers.ModelSerializer):
    # A plain source="added_by.email" field would be silently omitted from
    # the response (not serialized as null) for an item added_by=None — see
    # the equivalent note on catalog.GroceryItemSerializer.created_by_email.
    added_by_email = serializers.SerializerMethodField()
    grocery_item_price_detail = GroceryItemPriceSummarySerializer(
        source="grocery_item_price", read_only=True
    )
    packs_needed = serializers.SerializerMethodField()

    class Meta:
        model = ShoppingListItem
        fields = [
            "id",
            "shopping_list",
            "meal_plan",
            "name",
            "grams",
            "pieces",
            "milliliters",
            "grocery_item_price",
            "grocery_item_price_detail",
            "packs_needed",
            "is_checked",
            "added_by",
            "added_by_email",
            "created_at",
        ]
        read_only_fields = ["added_by", "created_at"]

    def get_packs_needed(self, obj):
        return obj.packs_needed

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Restrict which shopping lists this item can be filed under to ones
        # in the requesting user's own households — otherwise the default
        # queryset (every ShoppingList in the system) would let a user post
        # an item into a household they don't belong to just by knowing/
        # guessing its id.
        request = self.context.get("request")
        if request is not None:
            self.fields["shopping_list"].queryset = ShoppingList.objects.filter(
                household__members=request.user
            )

    def get_added_by_email(self, obj):
        return obj.added_by.email if obj.added_by else None
