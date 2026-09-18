from django.db.models.signals import post_save
from django.dispatch import receiver

from accounts.models import AppAccount, Student
from accounts.student_link import try_link_account_by_email, try_link_student_by_email


@receiver(post_save, sender=AppAccount)
def auto_link_app_account(sender, instance: AppAccount, **kwargs):
    if instance.student_id:
        return
    if instance.group_id:
        from accounts.student_link import find_student_for_account, link_account_to_student

        found = find_student_for_account(instance, instance.group)
        if found:
            link_account_to_student(instance, found, instance.group)
            return
    try_link_account_by_email(instance)


@receiver(post_save, sender=Student)
def auto_link_student_record(sender, instance: Student, **kwargs):
    try_link_student_by_email(instance)
