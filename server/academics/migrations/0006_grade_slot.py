from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("academics", "0005_role_invite_codes"),
    ]

    operations = [
        migrations.AddField(
            model_name="grade",
            name="slot",
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text="Порядковый номер урока в этот день (0, 1, 2…).",
                verbose_name="Урок в день",
            ),
        ),
        migrations.RemoveConstraint(
            model_name="grade",
            name="uniq_grade_assignment_student_date",
        ),
        migrations.AddConstraint(
            model_name="grade",
            constraint=models.UniqueConstraint(
                fields=("assignment", "student", "date", "slot"),
                name="uniq_grade_assignment_student_date_slot",
            ),
        ),
    ]
