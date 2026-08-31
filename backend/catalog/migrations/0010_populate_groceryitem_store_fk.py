from django.db import migrations


def populate_store_fk(apps, schema_editor):
    GroceryItem = apps.get_model("catalog", "GroceryItem")
    Store = apps.get_model("catalog", "Store")

    # Cache so items sharing a store text (the common case) only look it up
    # once, matching case-insensitively against the seeded list.
    stores_by_lower_name = {s.name.lower(): s for s in Store.objects.all()}

    for item in GroceryItem.objects.all():
        text = (item.store or "").strip()
        store = stores_by_lower_name.get(text.lower())
        if store is None:
            # Not one of the seeded chains (e.g. a store typed in freehand
            # before this became a fixed list) — keep the data by creating
            # a Store for it rather than dropping/guessing.
            store = Store.objects.create(name=text or "Unknown")
            stores_by_lower_name[store.name.lower()] = store
        item.store_fk = store
        item.save(update_fields=["store_fk"])


def restore_store_text(apps, schema_editor):
    GroceryItem = apps.get_model("catalog", "GroceryItem")
    for item in GroceryItem.objects.select_related("store_fk").all():
        if item.store_fk_id:
            item.store = item.store_fk.name
            item.save(update_fields=["store"])


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0009_groceryitem_store_fk"),
    ]

    operations = [
        migrations.RunPython(populate_store_fk, restore_store_text),
    ]
