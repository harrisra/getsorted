from django.db import migrations

STORE_NAMES = [
    "Tesco",
    "Sainsburys",
    "Asda",
    "Aldi",
    "Lidl",
    "Morrisons",
    "Co-op",
    "Waitrose",
    "Iceland",
    "M&S Food",
    "Costco",
    "Farmfoods",
    "Ocado",
    "Boots",
]


def seed_stores(apps, schema_editor):
    Store = apps.get_model("catalog", "Store")
    for name in STORE_NAMES:
        Store.objects.get_or_create(name=name)


def remove_seeded_stores(apps, schema_editor):
    Store = apps.get_model("catalog", "Store")
    Store.objects.filter(name__in=STORE_NAMES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0007_store"),
    ]

    operations = [
        migrations.RunPython(seed_stores, remove_seeded_stores),
    ]
