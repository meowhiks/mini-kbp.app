from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("academics", "0007_journalday_slot"),
    ]

    operations = [
        migrations.AddField(
            model_name="journalday",
            name="lab_credited",
            field=models.BooleanField(default=False, verbose_name="Зачтено (лаб.)"),
        ),
        migrations.AddField(
            model_name="journalday",
            name="lab_due_date",
            field=models.DateField(blank=True, null=True, verbose_name="Срок сдачи лаб."),
        ),
        migrations.AddField(
            model_name="latenessrecord",
            name="slot",
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text="Порядковый номер урока в этот день (0, 1, 2…).",
                verbose_name="Урок в день",
            ),
        ),
        migrations.RemoveConstraint(
            model_name="latenessrecord",
            name="uniq_lateness_group_student_date",
        ),
        migrations.AddConstraint(
            model_name="latenessrecord",
            constraint=models.UniqueConstraint(
                fields=("group", "student", "date", "slot"),
                name="uniq_lateness_group_student_date_slot",
            ),
        ),
    ]
