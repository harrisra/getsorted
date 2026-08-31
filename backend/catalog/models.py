import uuid

from django.conf import settings
from django.db import models


class Store(models.Model):
    """A grocery store/chain, e.g. Tesco, Aldi.

    Its own model (rather than a plain choices list on GroceryItem) so it
    can grow its own attributes later — logo, website, etc. — without
    touching GroceryItem.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Aisle(models.TextChoices):
    FRUIT_VEG = "fruit_veg", "Fruit & Veg"
    BAKERY = "bakery", "Bakery"
    MEAT_FISH = "meat_fish", "Meat & Fish"
    DAIRY_EGGS = "dairy_eggs", "Dairy & Eggs"
    CHILLED_READY_MEALS = "chilled_ready_meals", "Chilled & Ready Meals"
    FROZEN = "frozen", "Frozen"
    TINS_PACKETS = "tins_packets", "Tins & Packets"
    PASTA_RICE_WORLD_FOODS = "pasta_rice_world_foods", "Pasta Rice & World Foods"
    SAUCES_OILS_SEASONINGS = "sauces_oils_seasonings", "Sauces Oils & Seasonings"
    BREAKFAST_SPREADS = "breakfast_spreads", "Breakfast & Spreads"
    SNACKS_SWEETS = "snacks_sweets", "Snacks & Sweets"
    TEA_COFFEE_SOFT_DRINKS = "tea_coffee_soft_drinks", "Tea Coffee & Soft Drinks"
    ALCOHOL = "alcohol", "Alcohol"
    FREE_FROM_VEGAN = "free_from_vegan", "Free From & Vegan"
    BABY_PET = "baby_pet", "Baby & Pet"
    HOUSEHOLD_CLEANING = "household_cleaning", "Household & Cleaning"
    TOILETRIES_HEALTH = "toiletries_health", "Toiletries & Health"


class GroceryItem(models.Model):
    """A store-bought product in the shared, app-wide grocery catalog.

    Unlike other domain data this isn't scoped to a Household — it's a single
    catalog every household can browse and contribute to, e.g. so the same
    "Tesco British Cooked Ham Slices 120g" entry can be reused by anyone.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(Store, on_delete=models.PROTECT, related_name="grocery_items")
    name = models.CharField(max_length=255)
    brand = models.CharField(max_length=255, blank=True)
    # Which supermarket aisle this is shelved in — optional, so existing/
    # quickly-added items aren't forced to pick one.
    aisle = models.CharField(max_length=30, choices=Aisle.choices, blank=True)
    # At least one of these must be set — enforced in the serializer, since
    # any one alone is a valid way to describe a product's size.
    grams = models.PositiveIntegerField(null=True, blank=True)
    pieces = models.PositiveIntegerField(null=True, blank=True)
    milliliters = models.PositiveIntegerField(null=True, blank=True)
    price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    product_url = models.URLField(blank=True)
    image_url = models.URLField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["store__name", "name"]

    def __str__(self):
        return f"{self.store.name} — {self.name}"
