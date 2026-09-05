import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0017_remove_groceryitem_store_price_url"),
        ("mealplanner", "0027_finalize_grocery_item_price_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="RecipeIngredientGroceryItem",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "grocery_item",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="recipe_ingredient_matches",
                        to="catalog.groceryitem",
                    ),
                ),
                (
                    "recipe_ingredient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="grocery_matches",
                        to="mealplanner.recipeingredient",
                    ),
                ),
            ],
            options={
                "unique_together": {("recipe_ingredient", "grocery_item")},
            },
        ),
    ]
