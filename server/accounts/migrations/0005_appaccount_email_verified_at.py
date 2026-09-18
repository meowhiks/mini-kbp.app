from django.db import migrations, models
from django.utils import timezone


def mark_existing_verified(apps, schema_editor):
    AppAccount = apps.get_model("accounts", "AppAccount")
    AppAccount.objects.filter(email__isnull=False).exclude(email="").update(
        email_verified_at=timezone.now()
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_appaccount_avatar_url_appaccount_gender_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="appaccount",
            name="email_verified_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Email подтверждён"),
        ),
        migrations.RunPython(mark_existing_verified, migrations.RunPython.noop),
    ]
