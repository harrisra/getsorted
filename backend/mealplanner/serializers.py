from decimal import Decimal

from rest_framework import serializers
from rest_framework.reverse import reverse

from catalog.models import GroceryItem, GroceryItemPrice
from .models import (
    MealPlan,
    MealSlot,
    Recipe,
    RecipeIngredient,
    RecipeIngredientGroceryItem,
    ShoppingList,
    ShoppingListItem,
)


class GroceryItemPriceSummarySerializer(serializers.ModelSerializer):
    # Read-only here (nested under a ShoppingListItem), so just the store's
    # name rather than the FK id, and the product's own name/image rather
    # than needing a second round trip to the catalog — GroceryItemCombobox
    # displays/searches them as plain text.
    store = serializers.CharField(source="store.name", read_only=True)
    name = serializers.CharField(source="grocery_item.name", read_only=True)
    image_url = serializers.CharField(source="grocery_item.image_url", read_only=True)

    class Meta:
        model = GroceryItemPrice
        fields = ["id", "store", "name", "image_url", "price", "promo_price"]


class GroceryItemSummarySerializer(serializers.ModelSerializer):
    """The matched product itself — just enough for GroceryItemCombobox to
    display/search it (name/brand/size/image). Each store's price for it is
    reported separately (see RecipeIngredientGroceryItemSerializer.store_costs)
    since a product can be priced at several stores at once."""

    class Meta:
        model = GroceryItem
        fields = ["id", "name", "brand", "image_url", "grams", "pieces", "milliliters"]


class RecipeIngredientGroceryItemSerializer(serializers.ModelSerializer):
    grocery_item_detail = GroceryItemSummarySerializer(source="grocery_item", read_only=True)
    store_costs = serializers.SerializerMethodField()

    class Meta:
        model = RecipeIngredientGroceryItem
        fields = ["id", "grocery_item", "grocery_item_detail", "store_costs"]
        read_only_fields = ["id"]

    def get_store_costs(self, match):
        """This match's product, scaled to the ingredient's amount needed,
        at every store it's currently priced at — computed here rather than
        stored, so a store starting/stopping stocking it is reflected
        automatically rather than needing the match re-picked. One entry per
        priced store; each entry's line_cost is None if there's no shared
        unit (grams/milliliters/pieces) to scale by.
        """
        item = match.grocery_item
        ingredient = match.recipe_ingredient
        ratio = None
        for dimension in ("grams", "milliliters", "pieces"):
            item_amount = getattr(item, dimension)
            ingredient_amount = getattr(ingredient, dimension)
            if item_amount and ingredient_amount is not None:
                ratio = Decimal(ingredient_amount) / Decimal(item_amount)
                break

        results = []
        for price_row in item.store_prices.all():
            cost = None
            if ratio is not None and price_row.price is not None:
                cost = (price_row.price * ratio).quantize(Decimal("0.01"))
            results.append(
                {
                    "store": price_row.store_id,
                    "store_name": price_row.store.name,
                    "price": str(price_row.price) if price_row.price is not None else None,
                    "line_cost": str(cost) if cost is not None else None,
                    # Exposed for callers to flag "this ingredient has a
                    # current promo" (e.g. RecipesPage's highlight) — not
                    # used in line_cost/cost calculations, which stay on the
                    # regular price only (see catalog.GroceryItemPrice.promo_price).
                    "promo_price": str(price_row.promo_price) if price_row.promo_price is not None else None,
                }
            )
        return results


class RecipeIngredientSerializer(serializers.ModelSerializer):
    # Matches to one or more catalog products — see
    # RecipeIngredientGroceryItem. Written as raw dicts by
    # RecipeSerializer._set_ingredients rather than through this nested
    # serializer's own create/update, same as `ingredients` itself.
    grocery_matches = RecipeIngredientGroceryItemSerializer(many=True, required=False)
    line_cost = serializers.SerializerMethodField()

    class Meta:
        model = RecipeIngredient
        fields = [
            "id",
            "name",
            "grams",
            "pieces",
            "milliliters",
            "grocery_matches",
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

        grocery_matches = attrs.get("grocery_matches")
        if grocery_matches:
            item_ids = [match["grocery_item"].id for match in grocery_matches]
            if len(item_ids) != len(set(item_ids)):
                raise serializers.ValidationError(
                    {"grocery_matches": "The same grocery item can only be matched once."}
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
    has_promo_price = serializers.BooleanField(read_only=True)

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
            "has_promo_price",
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
        matches = []
        for data in ingredients_data:
            matches_data = data.pop("grocery_matches", [])
            ingredient = RecipeIngredient(recipe=recipe, **data)
            ingredients.append(ingredient)
            for match in matches_data:
                matches.append(
                    RecipeIngredientGroceryItem(
                        recipe_ingredient=ingredient,
                        grocery_item=match["grocery_item"],
                    )
                )
        # Ingredients first — the matches' FK needs their (UUID, so already
        # client-side generated) ids to already exist as rows.
        RecipeIngredient.objects.bulk_create(ingredients)
        RecipeIngredientGroceryItem.objects.bulk_create(matches)


class RecipeSummarySerializer(RecipeImageMixin, serializers.ModelSerializer):
    current_cost = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    has_promo_price = serializers.BooleanField(read_only=True)

    class Meta:
        model = Recipe
        fields = ["id", "name", "meal_type", "servings", "current_cost", "image", "has_promo_price"]

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
        fields = [
            "id",
            "household",
            "name",
            "item_count",
            "excluded_stores",
            "created_by",
            "created_by_email",
            "created_at",
        ]
        read_only_fields = ["created_by", "created_at"]

    def get_created_by_email(self, obj):
        return obj.created_by.email if obj.created_by else None

    def update(self, instance, validated_data):
        # Re-optimize every item's store whenever the excluded set actually
        # changes, in either direction — excluding a store moves items away
        # from it, and re-including one can bring it back as the cheapest
        # option again. See ShoppingList.reoptimize_item_stores.
        excluded_stores = validated_data.get("excluded_stores")
        excluded_stores_changed = False
        if excluded_stores is not None:
            previous_ids = set(instance.excluded_stores.values_list("id", flat=True))
            new_ids = {store.id for store in excluded_stores}
            excluded_stores_changed = previous_ids != new_ids

        shopping_list = super().update(instance, validated_data)

        if excluded_stores_changed:
            shopping_list.reoptimize_item_stores()
        return shopping_list


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
