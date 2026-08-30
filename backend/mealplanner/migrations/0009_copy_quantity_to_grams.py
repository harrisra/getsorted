import re

from django.db import migrations

GRAMS_RE = re.compile(r"^\s*(\d+)\s*g\s*$", re.IGNORECASE)


def copy_quantity_to_grams(apps, schema_editor):
    RecipeIngredient = apps.get_model("mealplanner", "RecipeIngredient")
    for ingredient in RecipeIngredient.objects.exclude(quantity="").exclude(grams__isnull=False):
        match = GRAMS_RE.match(ingredient.quantity)
        if match:
            ingredient.grams = int(match.group(1))
            ingredient.save(update_fields=["grams"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("mealplanner", "0008_recipeingredient_grams_recipeingredient_pieces"),
    ]

    operations = [
        migrations.RunPython(copy_quantity_to_grams, noop_reverse),
    ]
