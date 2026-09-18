# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("academics", "0008_lateness_slot_lab_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="journalday",
            name="red_absent",
            field=models.BooleanField(default=False, verbose_name="Красная неявка"),
        ),
    ]
