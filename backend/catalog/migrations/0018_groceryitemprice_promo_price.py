from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0017_remove_groceryitem_store_price_url"),
    ]

    operations = [
        migrations.AddField(
            model_name="groceryitemprice",
            name="promo_price",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True),
        ),
    ]
