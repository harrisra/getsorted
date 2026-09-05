from django.db import migrations


def populate_grocery_item_prices(apps, schema_editor):
    GroceryItem = apps.get_model("catalog", "GroceryItem")
    GroceryItemPrice = apps.get_model("catalog", "GroceryItemPrice")

    for item in GroceryItem.objects.all():
        GroceryItemPrice.objects.create(
            grocery_item=item,
            store_id=item.store_id,
            price=item.price,
            product_url=item.product_url,
        )


def restore_groceryitem_fields(apps, schema_editor):
    GroceryItem = apps.get_model("catalog", "GroceryItem")
    GroceryItemPrice = apps.get_model("catalog", "GroceryItemPrice")

    # Reverses populate_grocery_item_prices only — GroceryItem still has one
    # row per store at this point in the migration history (the store/price/
    # product_url fields aren't removed from it until 0017), so there's
    # exactly one GroceryItemPrice per GroceryItem to fold back in.
    for price in GroceryItemPrice.objects.all():
        GroceryItem.objects.filter(pk=price.grocery_item_id).update(
            store_id=price.store_id, price=price.price, product_url=price.product_url
        )
    GroceryItemPrice.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0015_groceryitemprice"),
    ]

    operations = [
        migrations.RunPython(populate_grocery_item_prices, restore_groceryitem_fields),
    ]
