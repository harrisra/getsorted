import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from accounts.models import Household


class MealType(models.TextChoices):
    BREAKFAST = "breakfast", "Breakfast"
    LUNCH = "lunch", "Lunch"
    DINNER = "dinner", "Dinner"
    SNACK = "snack", "Snack"


MAX_RECIPE_IMAGE_MB = 5


def validate_recipe_image_size(file):
    """Unused by any current field — kept because migration 0004 imports it
    when Django loads the full migration history. Do not remove."""
    if file.size > MAX_RECIPE_IMAGE_MB * 1024 * 1024:
        raise ValidationError(f"Image must be smaller than {MAX_RECIPE_IMAGE_MB}MB.")


class Recipe(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name="recipes")
    name = models.CharField(max_length=255)
    meal_type = models.CharField(max_length=20, choices=MealType.choices)
    servings = models.PositiveSmallIntegerField(default=4, help_text="Number of people it feeds")
    instructions = models.TextField(blank=True)
    source_url = models.URLField(blank=True)
    # An externally-hosted photo, e.g. pasted from the recipe's source site.
    # Shown only when there's no uploaded image_data — see RecipeImageMixin.
    image_url = models.URLField(blank=True, max_length=400)
    # Stored in the DB rather than on disk so it survives on an ephemeral
    # container filesystem without needing separate object storage.
    image_data = models.BinaryField(null=True, blank=True)
    image_content_type = models.CharField(max_length=100, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    @property
    def current_cost(self):
        """Sum of each ingredient's cheapest matched option, proportional to
        the amount needed.

        "Cheapest matched option" rather than any one fixed store, since an
        ingredient can now be matched to a different GroceryItem per store
        (see RecipeIngredientStoreOption) — this is the best price achievable
        buying each ingredient wherever it's individually cheapest, not
        necessarily all from one shop. None (rather than 0) when nothing is
        priced, so "no data" isn't confused with "free". Shared by
        RecipeSerializer and MealPlan's day/week cost totals so the
        calculation lives in exactly one place.
        """
        prices = [
            ingredient.line_cost
            for ingredient in self.ingredients.all()
            if ingredient.line_cost is not None
        ]
        return sum(prices) if prices else None


class RecipeIngredient(models.Model):
    """One ingredient line within a Recipe.

    Optionally matched to catalog GroceryItems via RecipeIngredientStoreOption
    — at most one match per store, so the same ingredient can be priced
    against every store a household shops at (e.g. cheddar cheese at both
    Tesco and Aldi) to compare totals.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="ingredients")
    name = models.CharField(max_length=255)
    # At least one of these must be set — enforced in the serializer, since
    # any one alone is a valid way to describe a quantity.
    grams = models.PositiveIntegerField(null=True, blank=True)
    pieces = models.PositiveIntegerField(null=True, blank=True)
    milliliters = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        amount = " ".join(
            part
            for part in [
                f"{self.grams}g" if self.grams else "",
                f"{self.pieces}pc" if self.pieces else "",
                f"{self.milliliters}ml" if self.milliliters else "",
            ]
            if part
        )
        return f"{amount} {self.name}".strip()

    @property
    def line_cost(self):
        """The cheapest of this ingredient's matched store options, scaled
        to the amount needed. None if there are no priced matches."""
        costs = [
            option.line_cost for option in self.store_options.all() if option.line_cost is not None
        ]
        return min(costs) if costs else None


class RecipeIngredientStoreOption(models.Model):
    """One (ingredient, store) match: this RecipeIngredient can be bought as
    the linked GroceryItem at grocery_item.store. At most one match per
    store per ingredient — enforced by unique_together on `store`, which is
    denormalized from grocery_item.store purely to get a real DB constraint
    (kept in sync in save()).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipe_ingredient = models.ForeignKey(
        RecipeIngredient, on_delete=models.CASCADE, related_name="store_options"
    )
    grocery_item = models.ForeignKey(
        "catalog.GroceryItem", on_delete=models.CASCADE, related_name="recipe_ingredient_options"
    )
    store = models.ForeignKey("catalog.Store", on_delete=models.CASCADE, editable=False)

    class Meta:
        unique_together = ("recipe_ingredient", "store")

    def save(self, *args, **kwargs):
        self.store_id = self.grocery_item.store_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.recipe_ingredient.name} @ {self.store.name}: {self.grocery_item.name}"

    @property
    def line_cost(self):
        """This match's share of the grocery item's price, scaled by
        whichever unit (grams/milliliters/pieces) both the ingredient and
        the item have in common — e.g. needing 250g of a 500g, £2 pack costs
        £1. None if there's no price, or no shared unit to scale by (rather
        than guessing, or falling back to the item's full price, which
        would silently overstate the cost).
        """
        item = self.grocery_item
        ingredient = self.recipe_ingredient
        if item.price is None:
            return None
        for dimension in ("grams", "milliliters", "pieces"):
            item_amount = getattr(item, dimension)
            ingredient_amount = getattr(ingredient, dimension)
            if item_amount and ingredient_amount is not None:
                cost = item.price * (Decimal(ingredient_amount) / Decimal(item_amount))
                return cost.quantize(Decimal("0.01"))
        return None


class MealPlan(models.Model):
    """A single household's meal plan for one week.

    week_start is the date of the household's configured week_start_day
    (see accounts.Household) for the week being planned.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name="meal_plans")
    week_start = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("household", "week_start")
        ordering = ["-week_start"]

    def __str__(self):
        return f"{self.household.name} — week of {self.week_start}"


class MealSlot(models.Model):
    """A single cell (e.g. Tuesday dinner) within a MealPlan.

    Holds zero or more recipes — a cell can be left empty, or have multiple
    recipes selected for it.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meal_plan = models.ForeignKey(MealPlan, on_delete=models.CASCADE, related_name="slots")
    date = models.DateField()
    meal_type = models.CharField(max_length=20, choices=MealType.choices)
    recipes = models.ManyToManyField(Recipe, blank=True, related_name="meal_slots")
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        unique_together = ("meal_plan", "date", "meal_type")
        ordering = ["date", "meal_type"]

    def __str__(self):
        return f"{self.date} {self.meal_type}"


class ShoppingList(models.Model):
    """A named shopping list within a household — a household can have
    several going at once (e.g. "This week", "Costco run")."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(
        Household, on_delete=models.CASCADE, related_name="shopping_lists"
    )
    name = models.CharField(max_length=255)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.household.name} — {self.name}"


class ShoppingListItem(models.Model):
    """An item on a shopping list, optionally linked to a meal plan."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shopping_list = models.ForeignKey(ShoppingList, on_delete=models.CASCADE, related_name="items")
    meal_plan = models.ForeignKey(
        MealPlan, on_delete=models.SET_NULL, null=True, blank=True, related_name="shopping_items"
    )
    name = models.CharField(max_length=255)
    quantity = models.CharField(max_length=100, blank=True)
    # Which specific catalog product (and so which store) to buy this item
    # as — picked from whichever GroceryItems name-match `name`, defaulting
    # to the cheapest. Optional: not every item corresponds to something in
    # the catalog (e.g. "Birthday candles").
    grocery_item = models.ForeignKey(
        "catalog.GroceryItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shopping_list_items",
    )
    is_checked = models.BooleanField(default=False)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["is_checked", "name"]

    def __str__(self):
        return self.name
