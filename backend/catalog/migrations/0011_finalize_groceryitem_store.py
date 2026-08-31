from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0010_populate_groceryitem_store_fk"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="groceryitem",
            name="store",
        ),
        migrations.RenameField(
            model_name="groceryitem",
            old_name="store_fk",
            new_name="store",
        ),
        migrations.AlterField(
            model_name="groceryitem",
            name="store",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="grocery_items",
                to="catalog.store",
            ),
        ),
        migrations.AlterModelOptions(
            name="groceryitem",
            options={"ordering": ["store__name", "name"]},
        ),
    ]
