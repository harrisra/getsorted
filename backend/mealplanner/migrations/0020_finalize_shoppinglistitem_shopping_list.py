import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("mealplanner", "0019_migrate_shopping_list_items"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="shoppinglistitem",
            name="household",
        ),
        migrations.AlterField(
            model_name="shoppinglistitem",
            name="shopping_list",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="items",
                to="mealplanner.shoppinglist",
            ),
        ),
    ]
