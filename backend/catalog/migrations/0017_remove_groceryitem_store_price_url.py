from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0016_populate_groceryitemprice"),
        # Must run after mealplanner has repointed RecipeIngredientStoreOption
        # and ShoppingListItem at GroceryItemPrice — its data migration
        # (0026) still reads GroceryItem.store, which this migration removes.
        ("mealplanner", "0027_finalize_grocery_item_price_fields"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="groceryitem",
            name="store",
        ),
        migrations.RemoveField(
            model_name="groceryitem",
            name="price",
        ),
        migrations.RemoveField(
            model_name="groceryitem",
            name="product_url",
        ),
        migrations.AlterModelOptions(
            name="groceryitem",
            options={"ordering": ["name"]},
        ),
    ]
