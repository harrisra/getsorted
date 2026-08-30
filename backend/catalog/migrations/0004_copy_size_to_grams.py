import re

from django.db import migrations

GRAMS_RE = re.compile(r"^\s*(\d+)\s*g\s*$", re.IGNORECASE)


def copy_size_to_grams(apps, schema_editor):
    GroceryItem = apps.get_model("catalog", "GroceryItem")
    for item in GroceryItem.objects.exclude(size="").exclude(grams__isnull=False):
        match = GRAMS_RE.match(item.size)
        if match:
            item.grams = int(match.group(1))
            item.save(update_fields=["grams"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0003_groceryitem_grams_groceryitem_pieces"),
    ]

    operations = [
        migrations.RunPython(copy_size_to_grams, noop_reverse),
    ]
