from django.db import migrations


def migrate_matches(apps, schema_editor):
    RecipeIngredientStoreOption = apps.get_model("mealplanner", "RecipeIngredientStoreOption")
    RecipeIngredientGroceryItem = apps.get_model("mealplanner", "RecipeIngredientGroceryItem")
    GroceryItemPrice = apps.get_model("catalog", "GroceryItemPrice")

    # Several old per-store options can collapse onto the same product match
    # (an ingredient matched at both Tesco's and Aldi's price for the same
    # GroceryItem) — get_or_create rather than create so that collapses
    # cleanly onto one row instead of tripping the new unique_together.
    for option in RecipeIngredientStoreOption.objects.all():
        price = GroceryItemPrice.objects.get(pk=option.grocery_item_price_id)
        RecipeIngredientGroceryItem.objects.get_or_create(
            recipe_ingredient_id=option.recipe_ingredient_id,
            grocery_item_id=price.grocery_item_id,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("mealplanner", "0028_recipeingredientgroceryitem"),
    ]

    operations = [
        # No reverse: a per-store option can't be reconstructed from a
        # product-only match — which store it originally pointed at isn't
        # recoverable from the data this leaves behind.
        migrations.RunPython(migrate_matches, migrations.RunPython.noop),
    ]
