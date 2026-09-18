"""
academics/models.py — академическая часть: группы, предметы, назначения.

Сущности:

Group       — учебная группа (например "ИС-21").
Subject     — предмет / дисциплина (например "Математика").
Enrollment  — связь Student ↔ Group (студент состоит в группе).
TeachingAssignment — связь Teacher ↔ Group ↔ Subject (учитель ведёт
             конкретный предмет у конкретной группы).

Связи выбраны так:
- Enrollment — many-to-many через явную таблицу, потому что студент
  может быть переведён в другую группу, нужно хранить дату зачисления.
- TeachingAssignment — many-to-many с дополнительными полями
  (семестр, часы, тип занятия). Тоже явная таблица.

Это даёт гибкость:
- один учитель — много групп и предметов,
- один предмет — много учителей (если поток делится),
- одна группа — много предметов и студентов.
"""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class Group(models.Model):
    """Учебная группа / поток."""

    name = models.CharField(_("Название"), max_length=64, unique=True)
    description = models.CharField(_("Описание"), max_length=255, blank=True)
    is_active = models.BooleanField(_("Активна"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Группа")
        verbose_name_plural = _("Группы")
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Subject(models.Model):
    """Предмет / дисциплина."""

    name = models.CharField(_("Название"), max_length=128, unique=True)
    short_name = models.CharField(_("Краткое название"), max_length=16, blank=True)
    description = models.CharField(_("Описание"), max_length=255, blank=True)
    is_active = models.BooleanField(_("Активен"), default=True)
    teachers = models.ManyToManyField(
        "accounts.Teacher",
        blank=True,
        related_name="subject_catalog",
        verbose_name=_("Преподаватели"),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Предмет")
        verbose_name_plural = _("Предметы")
        ordering = ["name"]

    def __str__(self) -> str:
        return self.short_name or self.name


class Enrollment(models.Model):
    """Студент зачислен в группу."""

    student = models.ForeignKey(
        "accounts.Student",
        on_delete=models.CASCADE,
        related_name="enrollments",
        verbose_name=_("Студент"),
    )
    group = models.ForeignKey(
        Group,
        on_delete=models.CASCADE,
        related_name="enrollments",
        verbose_name=_("Группа"),
    )
    enrolled_at = models.DateField(_("Дата зачисления"), auto_now_add=True)
    is_active = models.BooleanField(_("Активно"), default=True)

    class Meta:
        verbose_name = _("Зачисление")
        verbose_name_plural = _("Зачисления")
        # один студент — одна активная запись в группу одновременно
        constraints = [
            models.UniqueConstraint(
                fields=["student", "group"],
                name="uniq_student_group_enrollment",
            ),
        ]
        ordering = ["-enrolled_at"]

    def __str__(self) -> str:
        return f"{self.student} → {self.group}"


class TeachingAssignment(models.Model):
    """
    Назначение: какой учитель какую группу по какому предмету ведёт.
    """

    class LessonType(models.TextChoices):
        LECTURE = "lecture", _("Лекция")
        PRACTICE = "practice", _("Практика")
        LAB = "lab", _("Лабораторная")
        SEMINAR = "seminar", _("Семинар")

    teacher = models.ForeignKey(
        "accounts.Teacher",
        on_delete=models.CASCADE,
        related_name="assignments",
        verbose_name=_("Учитель"),
    )
    group = models.ForeignKey(
        Group,
        on_delete=models.CASCADE,
        related_name="assignments",
        verbose_name=_("Группа"),
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name="assignments",
        verbose_name=_("Предмет"),
    )
    lesson_type = models.CharField(
        _("Тип занятия"),
        max_length=16,
        choices=LessonType.choices,
        default=LessonType.LECTURE,
    )
    hours_per_week = models.PositiveSmallIntegerField(
        _("Часов в неделю"),
        default=0,
    )
    semester = models.PositiveSmallIntegerField(_("Семестр"), default=1)
    is_active = models.BooleanField(_("Активно"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Назначение")
        verbose_name_plural = _("Назначения")
        # одна и та же тройка (teacher, group, subject, lesson_type) — один раз
        constraints = [
            models.UniqueConstraint(
                fields=["teacher", "group", "subject", "lesson_type"],
                name="uniq_teaching_assignment",
            ),
        ]
        ordering = ["teacher", "group", "subject"]

    def __str__(self) -> str:
        return f"{self.teacher} → {self.group} [{self.subject} / {self.lesson_type}]"


class Grade(models.Model):
    """
    Отметка в кастомном журнале: студент × назначение × дата.
    Значение — строка (5, 4, Н, ОП и т.д.), как в электронном журнале КБиП.
    """

    assignment = models.ForeignKey(
        TeachingAssignment,
        on_delete=models.CASCADE,
        related_name="grades",
        verbose_name=_("Назначение"),
    )
    student = models.ForeignKey(
        "accounts.Student",
        on_delete=models.CASCADE,
        related_name="grades",
        verbose_name=_("Студент"),
    )
    date = models.DateField(_("Дата"))
    slot = models.PositiveSmallIntegerField(
        _("Урок в день"),
        default=0,
        help_text=_("Порядковый номер урока в этот день (0, 1, 2…)."),
    )
    value = models.CharField(_("Отметка"), max_length=16, blank=True)
    comment = models.CharField(_("Комментарий"), max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Отметка")
        verbose_name_plural = _("Отметки")
        constraints = [
            models.UniqueConstraint(
                fields=["assignment", "student", "date", "slot"],
                name="uniq_grade_assignment_student_date_slot",
            ),
        ]
        ordering = ["-date", "slot", "student__full_name"]

    def __str__(self) -> str:
        return f"{self.student} / {self.assignment.subject} / {self.date}: {self.value or '—'}"


class JournalDay(models.Model):
    """Колонка даты в журнале назначения (видимость, тип дня, пояснение в футере)."""

    class DayType(models.TextChoices):
        NORMAL = "normal", _("Обычный")
        LAB = "lab", _("Лабораторная работа")
        OKR = "okr", _("ОКР")

    assignment = models.ForeignKey(
        TeachingAssignment,
        on_delete=models.CASCADE,
        related_name="journal_days",
        verbose_name=_("Назначение"),
    )
    date = models.DateField(_("Дата"))
    slot = models.PositiveSmallIntegerField(
        _("Урок в день"),
        default=0,
        help_text=_("Порядковый номер урока в этот день (0, 1, 2…)."),
    )
    day_type = models.CharField(
        _("Тип дня"),
        max_length=16,
        choices=DayType.choices,
        default=DayType.NORMAL,
    )
    footer_note = models.CharField(_("Пояснение к уроку"), max_length=255, blank=True)
    lab_due_date = models.DateField(_("Срок сдачи лаб."), null=True, blank=True)
    lab_credited = models.BooleanField(_("Зачтено (лаб.)"), default=False)
    red_absent = models.BooleanField(_("Красная неявка"), default=False)

    class Meta:
        verbose_name = _("День журнала")
        verbose_name_plural = _("Дни журнала")
        constraints = [
            models.UniqueConstraint(
                fields=["assignment", "date", "slot"],
                name="uniq_journal_day_assignment_date_slot",
            ),
        ]
        ordering = ["date", "slot"]

    def __str__(self) -> str:
        return f"{self.assignment} / {self.date}"


class LatenessRecord(models.Model):
    """Опоздание студента в группе (минуты)."""

    group = models.ForeignKey(
        Group,
        on_delete=models.CASCADE,
        related_name="lateness_records",
        verbose_name=_("Группа"),
    )
    student = models.ForeignKey(
        "accounts.Student",
        on_delete=models.CASCADE,
        related_name="lateness_records",
        verbose_name=_("Студент"),
    )
    date = models.DateField(_("Дата"))
    slot = models.PositiveSmallIntegerField(
        _("Урок в день"),
        default=0,
        help_text=_("Порядковый номер урока в этот день (0, 1, 2…)."),
    )
    minutes = models.PositiveSmallIntegerField(_("Минуты"), default=0)

    class Meta:
        verbose_name = _("Опоздание")
        verbose_name_plural = _("Опоздания")
        constraints = [
            models.UniqueConstraint(
                fields=["group", "student", "date", "slot"],
                name="uniq_lateness_group_student_date_slot",
            ),
        ]
        ordering = ["-date"]

    def __str__(self) -> str:
        return f"{self.student} → {self.group} / {self.date}: {self.minutes}м"


class GroupCurator(models.Model):
    """Куратор группы — может смотреть все журналы группы, но не редактировать."""

    teacher = models.ForeignKey(
        "accounts.Teacher",
        on_delete=models.CASCADE,
        related_name="curator_groups",
        verbose_name=_("Учитель"),
    )
    group = models.ForeignKey(
        Group,
        on_delete=models.CASCADE,
        related_name="curators",
        verbose_name=_("Группа"),
    )

    class Meta:
        verbose_name = _("Куратор группы")
        verbose_name_plural = _("Кураторы групп")
        constraints = [
            models.UniqueConstraint(
                fields=["teacher", "group"],
                name="uniq_group_curator",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.teacher} куратор {self.group}"


class CuratorInviteCode(models.Model):
    """Одноразовый код-пароль для назначения роли при входе на /app."""

    class Role(models.TextChoices):
        STUDENT = "student", _("Студент")
        TEACHER = "teacher", _("Преподаватель")

    role = models.CharField(
        _("Роль"),
        max_length=16,
        choices=Role.choices,
        default=Role.STUDENT,
    )
    group = models.ForeignKey(
        Group,
        on_delete=models.CASCADE,
        related_name="invite_codes",
        verbose_name=_("Группа"),
        null=True,
        blank=True,
    )
    kbp_teacher = models.ForeignKey(
        "academics.KbpTeacher",
        on_delete=models.SET_NULL,
        related_name="invite_codes",
        verbose_name=_("Преподаватель kbp"),
        null=True,
        blank=True,
        help_text=_("При redeem teacher-кода привязывает Teacher к этому KbpTeacher."),
    )
    code = models.CharField(_("Код"), max_length=8, unique=True)
    created_by = models.ForeignKey(
        "accounts.Teacher",
        on_delete=models.SET_NULL,
        related_name="invite_codes_created",
        verbose_name=_("Создал"),
        null=True,
        blank=True,
    )
    used_by = models.ForeignKey(
        "accounts.AppAccount",
        on_delete=models.SET_NULL,
        related_name="invite_codes_used",
        verbose_name=_("Использовал"),
        null=True,
        blank=True,
    )
    used_at = models.DateTimeField(_("Использован"), null=True, blank=True)
    expires_at = models.DateTimeField(_("Действует до"))
    max_uses = models.PositiveSmallIntegerField(_("Макс. использований"), default=1)
    use_count = models.PositiveSmallIntegerField(_("Использовано"), default=0)
    is_active = models.BooleanField(_("Активен"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Код-пароль")
        verbose_name_plural = _("Коды-пароли")
        ordering = ["-created_at"]

    def __str__(self) -> str:
        group_part = self.group.name if self.group_id else "—"
        return f"{self.get_role_display()} / {group_part} / {self.code}"


class JournalBackup(models.Model):
    """Сжатый снимок журналов (удаление запрещено на уровне API)."""

    backup_date = models.DateField(_("Дата снимка"), unique=True)
    payload_gz = models.BinaryField(_("Данные gzip"))
    uncompressed_bytes = models.PositiveIntegerField(default=0)
    compressed_bytes = models.PositiveIntegerField(default=0)
    stats = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Бэкап журнала")
        verbose_name_plural = _("Бэкапы журналов")
        ordering = ["-backup_date"]

    def __str__(self) -> str:
        return f"Журнал {self.backup_date}"


class JournalAuditLog(models.Model):
    """Аудит операций журнала (undo > 100 шагов, история админа)."""

    class Action(models.TextChoices):
        GRADE_SET = "grade_set", _("Отметка")
        GRADE_DELETE = "grade_delete", _("Удаление отметки")
        DAY_META = "day_meta", _("Мета дня")
        LATENESS = "lateness", _("Опоздание")
        COLUMN_ADD = "column_add", _("Добавление колонки")
        COLUMN_DELETE = "column_delete", _("Удаление колонки")

    assignment = models.ForeignKey(
        TeachingAssignment,
        on_delete=models.CASCADE,
        related_name="audit_logs",
        verbose_name=_("Назначение"),
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="journal_audit_logs",
        verbose_name=_("Актор"),
    )
    action = models.CharField(_("Действие"), max_length=32, choices=Action.choices)
    client_op_id = models.CharField(_("ID клиента"), max_length=64, blank=True, db_index=True)
    payload = models.JSONField(_("Данные"), default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Аудит журнала")
        verbose_name_plural = _("Аудит журналов")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["assignment", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.assignment_id} / {self.action} / {self.created_at:%Y-%m-%d %H:%M}"


# Catalog models from kbp.by (imported for Django model discovery)
from .kbp_catalog import (  # noqa: E402
    KbpGroup,
    KbpPlace,
    KbpSubject,
    KbpTeacher,
    KbpTeachingLink,
)

# Schedule replacement scans
from .replacements import ReplacementEntry, ReplacementScanBatch  # noqa: E402
