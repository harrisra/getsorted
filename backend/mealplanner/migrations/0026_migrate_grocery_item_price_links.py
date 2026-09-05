from django.db import migrations


def migrate_links(apps, schema_editor):
    RecipeIngredientStoreOption = apps.get_model("mealplanner", "RecipeIngredientStoreOption")
    ShoppingListItem = apps.get_model("mealplanner", "ShoppingListItem")
    GroceryItem = apps.get_model("catalog", "GroceryItem")
    GroceryItemPrice = apps.get_model("catalog", "GroceryItemPrice")

    # catalog's own 0016 data migration created exactly one GroceryItemPrice
    # per (old, store-specific) GroceryItem, at that same (grocery_item,
    # store) pair — so every option/item here has a matching row to find.
    for option in RecipeIngredientStoreOption.objects.all():
        price = GroceryItemPrice.objects.get(grocery_item_id=option.grocery_item_id, store_id=option.store_id)
        option.grocery_item_price_id = price.id
        option.save(update_fields=["grocery_item_price"])

    for item in ShoppingListItem.objects.exclude(grocery_item__isnull=True):
        # ShoppingListItem has no denormalized store of its own (unlike
        # RecipeIngredientStoreOption) — read it off the old GroceryItem
        # row, whose store/price/product_url fields aren't removed until
        # catalog's 0017 (this migration runs before that).
        old_item = GroceryItem.objects.get(pk=item.grocery_item_id)
        price = GroceryItemPrice.objects.get(grocery_item_id=old_item.id, store_id=old_item.store_id)
        item.grocery_item_price_id = price.id
        item.save(update_fields=["grocery_item_price"])


def restore_links(apps, schema_editor):
    RecipeIngredientStoreOption = apps.get_model("mealplanner", "RecipeIngredientStoreOption")
    ShoppingListItem = apps.get_model("mealplanner", "ShoppingListItem")

    for option in RecipeIngredientStoreOption.objects.exclude(grocery_item_price__isnull=True):
        option.grocery_item_price_id = None
        option.save(update_fields=["grocery_item_price"])

    for item in ShoppingListItem.objects.exclude(grocery_item_price__isnull=True):
        item.grocery_item_price_id = None
        item.save(update_fields=["grocery_item_price"])


class Migration(migrations.Migration):

    dependencies = [
        ("mealplanner", "0025_add_grocery_item_price_fields"),
    ]

    operations = [
        migrations.RunPython(migrate_links, restore_links),
    ]
