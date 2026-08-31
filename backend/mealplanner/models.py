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
        """Sum of each ingredient's proportional line_cost.

        None (rather than 0) when nothing is priced, so "no data" isn't
        confused with "free". Shared by RecipeSerializer and MealPlan's
        day/week cost totals so the calculation lives in exactly one place.
        """
        prices = [
            ingredient.line_cost
            for ingredient in self.ingredients.all()
            if ingredient.line_cost is not None
        ]
        return sum(prices) if prices else None


class RecipeIngredient(models.Model):
    """One ingredient line within a Recipe, optionally linked to a catalog GroceryItem."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="ingredients")
    name = models.CharField(max_length=255)
    # At least one of these must be set — enforced in the serializer, since
    # any one alone is a valid way to describe a quantity.
    grams = models.PositiveIntegerField(null=True, blank=True)
    pieces = models.PositiveIntegerField(null=True, blank=True)
    milliliters = models.PositiveIntegerField(null=True, blank=True)
    grocery_item = models.ForeignKey(
        "catalog.GroceryItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recipe_ingredients",
    )
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
        """This ingredient's share of its linked grocery item's price.

        Scaled by whichever unit (grams/milliliters/pieces) both this
        ingredient and the linked item have in common — e.g. needing 250g of
        a 500g, £2 pack costs £1. None if there's no link, no price, or no
        shared unit to scale by (rather than guessing, or falling back to
        the item's full price, which would silently overstate the cost).
        """
        item = self.grocery_item
        if not item or item.price is None:
            return None
        for dimension in ("grams", "milliliters", "pieces"):
            item_amount = getattr(item, dimension)
            ingredient_amount = getattr(self, dimension)
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


class ShoppingListItem(models.Model):
    """An item on a household's shopping list, optionally linked to a meal plan."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(
        Household, on_delete=models.CASCADE, related_name="shopping_list_items"
    )
    meal_plan = models.ForeignKey(
        MealPlan, on_delete=models.SET_NULL, null=True, blank=True, related_name="shopping_items"
    )
    name = models.CharField(max_length=255)
    quantity = models.CharField(max_length=100, blank=True)
    is_checked = models.BooleanField(default=False)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["is_checked", "name"]

    def __str__(self):
        return self.name
