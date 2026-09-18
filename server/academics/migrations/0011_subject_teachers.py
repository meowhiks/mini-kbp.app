from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0007_push_device"),
        ("academics", "0010_alter_grade_options_alter_journalday_footer_note"),
    ]

    operations = [
        migrations.AddField(
            model_name="subject",
            name="teachers",
            field=models.ManyToManyField(
                blank=True,
                related_name="subject_catalog",
                to="accounts.teacher",
                verbose_name="Преподаватели",
            ),
        ),
    ]
