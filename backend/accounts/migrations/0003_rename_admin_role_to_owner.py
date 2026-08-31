from django.db import migrations, models


def admin_to_owner(apps, schema_editor):
    Membership = apps.get_model("accounts", "Membership")
    Membership.objects.filter(role="admin").update(role="owner")


def owner_to_admin(apps, schema_editor):
    Membership = apps.get_model("accounts", "Membership")
    Membership.objects.filter(role="owner").update(role="admin")


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_household_week_start_day"),
    ]

    operations = [
        migrations.RunPython(admin_to_owner, owner_to_admin),
        migrations.AlterField(
            model_name="membership",
            name="role",
            field=models.CharField(
                max_length=20,
                choices=[("owner", "Owner"), ("member", "Member")],
                default="member",
            ),
        ),
    ]
