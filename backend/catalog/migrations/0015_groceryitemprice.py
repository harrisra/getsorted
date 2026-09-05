import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0014_groceryitem_trolley_url"),
    ]

    operations = [
        migrations.CreateModel(
            name="GroceryItemPrice",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("price", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("product_url", models.URLField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "grocery_item",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="store_prices",
                        to="catalog.groceryitem",
                    ),
                ),
                (
                    "store",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="grocery_item_prices",
                        to="catalog.store",
                    ),
                ),
            ],
            options={
                "ordering": ["store__name"],
                "unique_together": {("grocery_item", "store")},
            },
        ),
    ]
