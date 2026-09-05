import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from accounts.models import Household
from catalog.models import GroceryItemPrice


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
        ingredient can be matched to several GroceryItems at once, each
        potentially priced at several stores (see RecipeIngredientGroceryItem,
        RecipeIngredient.store_costs) — this is the best price achievable
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

    Optionally matched to one or more catalog GroceryItems via
    RecipeIngredientGroceryItem — a product match, not a per-store one, so
    the same ingredient can match several products at once (e.g. both a
    Tesco and an Aldi cheddar) without needing a separate match per store.
    Which store ends up "the" match for cost purposes isn't chosen — it's
    computed from whichever stores each matched product currently has a
    price at (see store_costs/line_cost below), so a store starting or
    stopping stocking a matched product is reflected automatically.
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
    def store_costs(self):
        """(GroceryItemPrice, cost) pairs derived from every matched grocery
        item's current store prices, scaled to the amount needed by whichever
        unit (grams/milliliters/pieces) the ingredient and that item share —
        e.g. needing 250g of a 500g, £2 pack costs £1. One entry per priced
        store across every match (zero if a match has no priced stores, or
        no shared unit to scale by); a product priced at 3 stores
        contributes up to 3 entries.
        """
        costs = []
        for match in self.grocery_matches.all():
            item = match.grocery_item
            ratio = None
            for dimension in ("grams", "milliliters", "pieces"):
                item_amount = getattr(item, dimension)
                ingredient_amount = getattr(self, dimension)
                if item_amount and ingredient_amount is not None:
                    ratio = Decimal(ingredient_amount) / Decimal(item_amount)
                    break
            if ratio is None:
                continue
            for price_row in item.store_prices.all():
                if price_row.price is None:
                    continue
                costs.append((price_row, (price_row.price * ratio).quantize(Decimal("0.01"))))
        return costs

    @property
    def line_cost(self):
        """The cheapest cost across every store any matched grocery item is
        currently priced at. None if there are no priced matches."""
        costs = [cost for _, cost in self.store_costs]
        return min(costs) if costs else None


class RecipeIngredientGroceryItem(models.Model):
    """One grocery-catalog product this RecipeIngredient can be bought as.
    At most one match per product per ingredient (matching the same product
    twice would be redundant); several different products can each be
    matched at once (see RecipeIngredient's docstring).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipe_ingredient = models.ForeignKey(
        RecipeIngredient, on_delete=models.CASCADE, related_name="grocery_matches"
    )
    grocery_item = models.ForeignKey(
        "catalog.GroceryItem", on_delete=models.CASCADE, related_name="recipe_ingredient_matches"
    )

    class Meta:
        unique_together = ("recipe_ingredient", "grocery_item")

    def __str__(self):
        return f"{self.recipe_ingredient.name}: {self.grocery_item.name}"


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
    # Stores the household isn't planning to visit for this list — empty by
    # default, so every store starts "in" (the UI shows all of them
    # depressed/selected) without needing to backfill anything when a list
    # is created or a new Store is added to the catalog later. Toggling one
    # off re-points any items currently priced at that store elsewhere —
    # see reassign_items_away_from_stores.
    excluded_stores = models.ManyToManyField(
        "catalog.Store", blank=True, related_name="excluded_from_shopping_lists"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.household.name} — {self.name}"

    def reassign_items_away_from_stores(self, newly_excluded_store_ids):
        """For every item on this list currently priced at one of
        `newly_excluded_store_ids`, re-point it at the cheapest still-
        selected alternative — the same product at a different store, or a
        different product whose catalog name mentions this item's name
        (the same candidate search the frontend's per-item store picker
        uses) — leaving it unchanged if no alternative is available among
        the stores still selected.
        """
        excluded_store_ids = set(self.excluded_stores.values_list("id", flat=True))
        affected = self.items.select_related(
            "grocery_item_price__grocery_item", "grocery_item_price__store"
        ).filter(grocery_item_price__store_id__in=newly_excluded_store_ids)

        for item in affected:
            current = item.grocery_item_price
            cheapest = (
                GroceryItemPrice.objects.filter(
                    models.Q(grocery_item__name__icontains=item.name)
                    | models.Q(grocery_item_id=current.grocery_item_id)
                )
                .exclude(store_id__in=excluded_store_ids)
                .exclude(price__isnull=True)
                .order_by("price")
                .first()
            )
            if cheapest is not None:
                item.grocery_item_price = cheapest
                item.save(update_fields=["grocery_item_price"])


class ShoppingListItem(models.Model):
    """An item on a shopping list, optionally linked to a meal plan."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shopping_list = models.ForeignKey(ShoppingList, on_delete=models.CASCADE, related_name="items")
    meal_plan = models.ForeignKey(
        MealPlan, on_delete=models.SET_NULL, null=True, blank=True, related_name="shopping_items"
    )
    name = models.CharField(max_length=255)
    # The total amount needed of this item, across everything it was added
    # for — at least one is set once there's any quantity data (a manually
    # added item with none of these is just "make sure this is on the
    # list", no amount implied).
    grams = models.PositiveIntegerField(null=True, blank=True)
    pieces = models.PositiveIntegerField(null=True, blank=True)
    milliliters = models.PositiveIntegerField(null=True, blank=True)
    # Which specific catalog product, at which store, to buy this item as —
    # picked from whichever GroceryItems name-match `name`, defaulting to the
    # cheapest of their store prices. Optional: not every item corresponds to
    # something in the catalog (e.g. "Birthday candles").
    grocery_item_price = models.ForeignKey(
        "catalog.GroceryItemPrice",
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

    @property
    def packs_needed(self):
        """How many of the matched grocery item to buy to cover the amount
        needed, rounded up (e.g. needing 500g from a 200g pack means 3).
        None if there's no matched item, no needed-amount data, or no unit
        (grams/milliliters/pieces) shared between the two to compare."""
        if not self.grocery_item_price:
            return None
        item = self.grocery_item_price.grocery_item
        for dimension in ("grams", "milliliters", "pieces"):
            item_amount = getattr(item, dimension)
            needed_amount = getattr(self, dimension)
            if item_amount and needed_amount:
                return -(-needed_amount // item_amount)  # ceiling division
        return None
