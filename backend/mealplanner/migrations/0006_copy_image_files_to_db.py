import mimetypes

from django.db import migrations


def copy_files_to_db(apps, schema_editor):
    Recipe = apps.get_model("mealplanner", "Recipe")
    for recipe in Recipe.objects.exclude(image="").exclude(image__isnull=True):
        try:
            with recipe.image.open("rb") as f:
                recipe.image_data = f.read()
        except FileNotFoundError:
            continue
        content_type, _ = mimetypes.guess_type(recipe.image.name)
        recipe.image_content_type = content_type or "application/octet-stream"
        recipe.save(update_fields=["image_data", "image_content_type"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("mealplanner", "0005_recipe_image_content_type_recipe_image_data"),
    ]

    operations = [
        migrations.RunPython(copy_files_to_db, noop_reverse),
    ]
