from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0008_appaccount_google_sub"),
    ]

    operations = [
        migrations.AddField(
            model_name="pushdevice",
            name="account",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="push_devices",
                to="accounts.appaccount",
                verbose_name="Аккаунт",
            ),
        ),
        migrations.AddField(
            model_name="pushdevice",
            name="platform",
            field=models.CharField(default="android", max_length=16, verbose_name="Платформа"),
        ),
    ]
