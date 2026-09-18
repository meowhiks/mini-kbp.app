"""Справочник сущностей расписания kbp.by (без auth.User)."""

from django.db import models
from django.utils.translation import gettext_lazy as _


class KbpGroup(models.Model):
    kbp_id = models.CharField(_("ID kbp"), max_length=32, unique=True, db_index=True)
    name = models.CharField(_("Название"), max_length=128)
    is_active = models.BooleanField(_("Активна"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Группа kbp")
        verbose_name_plural = _("Группы kbp")
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.kbp_id})"


class KbpTeacher(models.Model):
    kbp_id = models.CharField(_("ID kbp"), max_length=32, unique=True, db_index=True)
    name = models.CharField(_("ФИО"), max_length=255)
    is_active = models.BooleanField(_("Активен"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Преподаватель kbp")
        verbose_name_plural = _("Преподаватели kbp")
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.kbp_id})"


class KbpSubject(models.Model):
    kbp_id = models.CharField(_("ID kbp"), max_length=32, unique=True, db_index=True)
    name = models.CharField(_("Название"), max_length=255)
    is_active = models.BooleanField(_("Активен"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Предмет kbp")
        verbose_name_plural = _("Предметы kbp")
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.kbp_id})"


class KbpPlace(models.Model):
    kbp_id = models.CharField(_("ID kbp"), max_length=32, unique=True, db_index=True)
    name = models.CharField(_("Название"), max_length=128)
    is_active = models.BooleanField(_("Активна"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Аудитория kbp")
        verbose_name_plural = _("Аудитории kbp")
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.kbp_id})"


class KbpTeachingLink(models.Model):
    """Связь преподаватель ↔ группа ↔ предмет из расписания kbp."""

    teacher = models.ForeignKey(
        KbpTeacher,
        on_delete=models.CASCADE,
        related_name="teaching_links",
        verbose_name=_("Преподаватель"),
    )
    group = models.ForeignKey(
        KbpGroup,
        on_delete=models.CASCADE,
        related_name="teaching_links",
        verbose_name=_("Группа"),
    )
    subject = models.ForeignKey(
        KbpSubject,
        on_delete=models.CASCADE,
        related_name="teaching_links",
        verbose_name=_("Предмет"),
    )
    place = models.ForeignKey(
        KbpPlace,
        on_delete=models.SET_NULL,
        related_name="teaching_links",
        verbose_name=_("Аудитория"),
        null=True,
        blank=True,
    )
    source = models.CharField(_("Источник"), max_length=32, default="timetable")
    last_seen_at = models.DateTimeField(_("Последний раз в расписании"), auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Связь расписания kbp")
        verbose_name_plural = _("Связи расписания kbp")
        constraints = [
            models.UniqueConstraint(
                fields=["teacher", "group", "subject"],
                name="uniq_kbp_teaching_link",
            ),
        ]
        ordering = ["teacher", "group", "subject"]

    def __str__(self) -> str:
        return f"{self.teacher} → {self.group} [{self.subject}]"
