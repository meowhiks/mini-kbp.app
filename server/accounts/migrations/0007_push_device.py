from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_app_session_and_profile_lock"),
    ]

    operations = [
        migrations.CreateModel(
            name="PushDevice",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("device_id", models.CharField(max_length=128, unique=True, verbose_name="ID устройства")),
                ("fcm_token", models.TextField(verbose_name="FCM token")),
                ("kbp_group_id", models.CharField(blank=True, max_length=64, verbose_name="ID группы kbp.by")),
                ("group_name", models.CharField(blank=True, max_length=128, verbose_name="Группа")),
                ("notify_timetable", models.BooleanField(default=True, verbose_name="Расписание")),
                ("notify_journal", models.BooleanField(default=False, verbose_name="Журнал")),
                ("active", models.BooleanField(default=True, verbose_name="Активна")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Обновлено")),
            ],
            options={
                "verbose_name": "Push-устройство",
                "verbose_name_plural": "Push-устройства",
                "ordering": ["-updated_at"],
            },
        ),
    ]
