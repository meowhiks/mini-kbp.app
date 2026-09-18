from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("academics", "0011_subject_teachers"),
    ]

    operations = [
        migrations.CreateModel(
            name="JournalBackup",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("backup_date", models.DateField(unique=True, verbose_name="Дата снимка")),
                ("payload_gz", models.BinaryField(verbose_name="Данные gzip")),
                ("uncompressed_bytes", models.PositiveIntegerField(default=0)),
                ("compressed_bytes", models.PositiveIntegerField(default=0)),
                ("stats", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "verbose_name": "Бэкап журнала",
                "verbose_name_plural": "Бэкапы журналов",
                "ordering": ["-backup_date"],
            },
        ),
    ]
