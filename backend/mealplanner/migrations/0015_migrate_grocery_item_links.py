from django.db import migrations


def migrate_links(apps, schema_editor):
    RecipeIngredient = apps.get_model("mealplanner", "RecipeIngredient")
    RecipeIngredientStoreOption = apps.get_model("mealplanner", "RecipeIngredientStoreOption")

    for ingredient in RecipeIngredient.objects.exclude(grocery_item__isnull=True):
        RecipeIngredientStoreOption.objects.create(
            recipe_ingredient=ingredient,
            grocery_item=ingredient.grocery_item,
            store_id=ingredient.grocery_item.store_id,
        )


def restore_links(apps, schema_editor):
    RecipeIngredient = apps.get_model("mealplanner", "RecipeIngredient")
    RecipeIngredientStoreOption = apps.get_model("mealplanner", "RecipeIngredientStoreOption")

    for option in RecipeIngredientStoreOption.objects.all():
        RecipeIngredient.objects.filter(pk=option.recipe_ingredient_id).update(
            grocery_item_id=option.grocery_item_id
        )


class Migration(migrations.Migration):

    dependencies = [
        ("mealplanner", "0014_recipeingredientstoreoption"),
    ]

    operations = [
        migrations.RunPython(migrate_links, restore_links),
    ]
