# Generated manually for role invite codes

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_appaccount"),
        ("academics", "0004_curatorinvitecode"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="curatorinvitecode",
            name="uniq_group_invite_code",
        ),
        migrations.AddField(
            model_name="curatorinvitecode",
            name="role",
            field=models.CharField(
                choices=[("student", "Студент"), ("teacher", "Преподаватель")],
                default="student",
                max_length=16,
                verbose_name="Роль",
            ),
        ),
        migrations.AddField(
            model_name="curatorinvitecode",
            name="used_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Использован"),
        ),
        migrations.AddField(
            model_name="curatorinvitecode",
            name="used_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="invite_codes_used",
                to="accounts.appaccount",
                verbose_name="Использовал",
            ),
        ),
        migrations.AlterField(
            model_name="curatorinvitecode",
            name="code",
            field=models.CharField(max_length=8, unique=True, verbose_name="Код"),
        ),
        migrations.AlterField(
            model_name="curatorinvitecode",
            name="created_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="invite_codes_created",
                to="accounts.teacher",
                verbose_name="Создал",
            ),
        ),
        migrations.AlterField(
            model_name="curatorinvitecode",
            name="group",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="invite_codes",
                to="academics.group",
                verbose_name="Группа",
            ),
        ),
        migrations.AlterField(
            model_name="curatorinvitecode",
            name="max_uses",
            field=models.PositiveSmallIntegerField(default=1, verbose_name="Макс. использований"),
        ),
        migrations.AlterModelOptions(
            name="curatorinvitecode",
            options={
                "ordering": ["-created_at"],
                "verbose_name": "Код-пароль",
                "verbose_name_plural": "Коды-пароли",
            },
        ),
    ]
