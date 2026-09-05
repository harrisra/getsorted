from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("mealplanner", "0029_migrate_recipe_ingredient_grocery_matches"),
    ]

    operations = [
        migrations.DeleteModel(
            name="RecipeIngredientStoreOption",
        ),
    ]
