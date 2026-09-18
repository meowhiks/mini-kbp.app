from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("academics", "0006_grade_slot"),
    ]

    operations = [
        migrations.AddField(
            model_name="journalday",
            name="slot",
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text="Порядковый номер урока в этот день (0, 1, 2…).",
                verbose_name="Урок в день",
            ),
        ),
        migrations.RemoveConstraint(
            model_name="journalday",
            name="uniq_journal_day_assignment_date",
        ),
        migrations.AddConstraint(
            model_name="journalday",
            constraint=models.UniqueConstraint(
                fields=("assignment", "date", "slot"),
                name="uniq_journal_day_assignment_date_slot",
            ),
        ),
        migrations.AlterModelOptions(
            name="journalday",
            options={
                "ordering": ["date", "slot"],
                "verbose_name": "День журнала",
                "verbose_name_plural": "Дни журнала",
            },
        ),
    ]
