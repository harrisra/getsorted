from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0017_remove_groceryitem_store_price_url"),
        ("mealplanner", "0030_delete_recipeingredientstoreoption"),
    ]

    operations = [
        migrations.AddField(
            model_name="shoppinglist",
            name="excluded_stores",
            field=models.ManyToManyField(
                blank=True,
                related_name="excluded_from_shopping_lists",
                to="catalog.store",
            ),
        ),
    ]
