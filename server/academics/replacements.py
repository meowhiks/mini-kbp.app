"""Модели сканов замен расписания (бумажный лист → overlay)."""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class ReplacementScanBatch(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", _("Черновик")
        PUBLISHED = "published", _("Опубликован")

    date = models.DateField(_("Дата"), null=True, blank=True, db_index=True)
    day_of_week = models.CharField(_("День недели"), max_length=32, blank=True)
    signed_by = models.CharField(_("Подпись"), max_length=255, blank=True)
    status = models.CharField(
        _("Статус"),
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replacement_batches",
        verbose_name=_("Создал"),
    )
    ocr_meta = models.JSONField(_("OCR meta"), default=dict, blank=True)
    published_at = models.DateTimeField(_("Опубликован"), null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Пакет замен")
        verbose_name_plural = _("Пакеты замен")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Batch #{self.pk} {self.date or '—'} ({self.status})"


class ReplacementEntry(models.Model):
    class EventType(models.TextChoices):
        NEW_LESSON = "NEW_LESSON", _("Новый урок")
        CANCELLATION = "CANCELLATION", _("Урок снят")
        REPLACEMENT = "REPLACEMENT", _("Замена")

    batch = models.ForeignKey(
        ReplacementScanBatch,
        on_delete=models.CASCADE,
        related_name="entries",
        verbose_name=_("Пакет"),
    )
    group_code = models.CharField(_("Код группы"), max_length=64, db_index=True)
    kbp_group = models.ForeignKey(
        "academics.KbpGroup",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replacement_entries",
        verbose_name=_("Группа kbp"),
    )
    lesson_number = models.PositiveSmallIntegerField(_("№ урока"))
    event_type = models.CharField(
        _("Тип"),
        max_length=16,
        choices=EventType.choices,
        db_index=True,
    )
    replacement_data = models.JSONField(_("Новые данные"), default=dict, blank=True)
    original_data = models.JSONField(_("Было"), default=dict, blank=True)
    kbp_subject = models.ForeignKey(
        "academics.KbpSubject",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replacement_entries",
        verbose_name=_("Предмет kbp"),
    )
    kbp_teacher = models.ForeignKey(
        "academics.KbpTeacher",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replacement_entries",
        verbose_name=_("Преподаватель kbp"),
    )
    kbp_place = models.ForeignKey(
        "academics.KbpPlace",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replacement_entries",
        verbose_name=_("Аудитория kbp"),
    )
    sort_order = models.PositiveIntegerField(_("Порядок"), default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Строка замены")
        verbose_name_plural = _("Строки замен")
        ordering = ["sort_order", "id"]
        indexes = [
            models.Index(fields=["batch", "group_code", "lesson_number"]),
        ]

    def __str__(self) -> str:
        return f"{self.group_code} #{self.lesson_number} {self.event_type}"
