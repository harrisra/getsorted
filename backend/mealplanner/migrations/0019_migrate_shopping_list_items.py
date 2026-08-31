from django.db import migrations

DEFAULT_LIST_NAME = "Shopping list"


def migrate_items(apps, schema_editor):
    ShoppingList = apps.get_model("mealplanner", "ShoppingList")
    ShoppingListItem = apps.get_model("mealplanner", "ShoppingListItem")

    # One default list per household that already has items, so existing
    # data lands somewhere sensible rather than being orphaned.
    lists_by_household = {}
    for item in ShoppingListItem.objects.all():
        shopping_list = lists_by_household.get(item.household_id)
        if shopping_list is None:
            shopping_list = ShoppingList.objects.create(
                household_id=item.household_id, name=DEFAULT_LIST_NAME
            )
            lists_by_household[item.household_id] = shopping_list
        item.shopping_list = shopping_list
        item.save(update_fields=["shopping_list"])


def restore_household(apps, schema_editor):
    ShoppingListItem = apps.get_model("mealplanner", "ShoppingListItem")
    for item in ShoppingListItem.objects.select_related("shopping_list").all():
        if item.shopping_list_id:
            item.household_id = item.shopping_list.household_id
            item.save(update_fields=["household"])


class Migration(migrations.Migration):

    dependencies = [
        ("mealplanner", "0018_shoppinglistitem_shopping_list"),
    ]

    operations = [
        migrations.RunPython(migrate_items, restore_household),
    ]
