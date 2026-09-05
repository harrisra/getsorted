import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0016_populate_groceryitemprice"),
        ("mealplanner", "0024_remove_shoppinglistitem_quantity"),
    ]

    operations = [
        migrations.AddField(
            model_name="recipeingredientstoreoption",
            name="grocery_item_price",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="recipe_ingredient_options",
                to="catalog.groceryitemprice",
            ),
        ),
        migrations.AddField(
            model_name="shoppinglistitem",
            name="grocery_item_price",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="shopping_list_items",
                to="catalog.groceryitemprice",
            ),
        ),
    ]
