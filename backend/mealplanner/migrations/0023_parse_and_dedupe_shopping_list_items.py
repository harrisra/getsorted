import re

from django.db import migrations

QUANTITY_PART_RE = re.compile(r"^(\d+)(g|pc|ml)$")


def parse_quantity(quantity):
    """The old free-text `quantity` was built (see the pre-ShoppingList
    `generate` action) by joining parts like "500g", "6pc", "150ml" with
    " + ". Recovers grams/pieces/milliliters from that where possible;
    anything that doesn't match the expected shape is just dropped rather
    than raising, since this is a best-effort recovery of existing data.
    """
    grams = pieces = milliliters = None
    for part in (quantity or "").split(" + "):
        match = QUANTITY_PART_RE.match(part.strip())
        if not match:
            continue
        amount, unit = int(match.group(1)), match.group(2)
        if unit == "g":
            grams = amount
        elif unit == "pc":
            pieces = amount
        elif unit == "ml":
            milliliters = amount
    return grams, pieces, milliliters


def parse_and_dedupe(apps, schema_editor):
    ShoppingList = apps.get_model("mealplanner", "ShoppingList")
    ShoppingListItem = apps.get_model("mealplanner", "ShoppingListItem")

    for item in ShoppingListItem.objects.all():
        grams, pieces, milliliters = parse_quantity(item.quantity)
        item.grams, item.pieces, item.milliliters = grams, pieces, milliliters
        item.save(update_fields=["grams", "pieces", "milliliters"])

    for shopping_list in ShoppingList.objects.all():
        seen_by_name = {}
        # Oldest first, so the earliest-added row of a duplicate group is
        # the one that survives (keeps its original added_by/meal_plan/
        # grocery_item rather than an arbitrary later duplicate's).
        for item in shopping_list.items.order_by("created_at"):
            key = item.name.strip().lower()
            keeper = seen_by_name.get(key)
            if keeper is None:
                seen_by_name[key] = item
                continue
            keeper.grams = (keeper.grams or 0) + (item.grams or 0) or None
            keeper.pieces = (keeper.pieces or 0) + (item.pieces or 0) or None
            keeper.milliliters = (keeper.milliliters or 0) + (item.milliliters or 0) or None
            keeper.save(update_fields=["grams", "pieces", "milliliters"])
            item.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("mealplanner", "0022_shoppinglistitem_grams_shoppinglistitem_milliliters_and_more"),
    ]

    operations = [
        # One-directional: recovering the original per-duplicate rows and
        # their exact quantity strings isn't meaningful to reverse.
        migrations.RunPython(parse_and_dedupe, migrations.RunPython.noop),
    ]
