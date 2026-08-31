from django.db import migrations


def rename_forward(apps, schema_editor):
    Store = apps.get_model("catalog", "Store")
    Store.objects.filter(name="Sainsbury's").update(name="Sainsburys")


def rename_backward(apps, schema_editor):
    Store = apps.get_model("catalog", "Store")
    Store.objects.filter(name="Sainsburys").update(name="Sainsbury's")


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0011_finalize_groceryitem_store"),
    ]

    operations = [
        migrations.RunPython(rename_forward, rename_backward),
    ]
