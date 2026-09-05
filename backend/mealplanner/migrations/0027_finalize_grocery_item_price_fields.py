import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("mealplanner", "0026_migrate_grocery_item_price_links"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="recipeingredientstoreoption",
            name="grocery_item",
        ),
        migrations.AlterField(
            model_name="recipeingredientstoreoption",
            name="grocery_item_price",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="recipe_ingredient_options",
                to="catalog.groceryitemprice",
            ),
        ),
        migrations.RemoveField(
            model_name="shoppinglistitem",
            name="grocery_item",
        ),
    ]
