from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0007_push_device"),
    ]

    operations = [
        migrations.AddField(
            model_name="appaccount",
            name="google_sub",
            field=models.CharField(
                blank=True,
                max_length=64,
                null=True,
                unique=True,
                verbose_name="Google sub",
            ),
        ),
    ]
