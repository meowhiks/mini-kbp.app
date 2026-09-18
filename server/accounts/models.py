"""
accounts/models.py — таблицы пользователей.

Два типа профилей:
- Teacher  — учитель / преподаватель.
- Student  — студент.

Оба профиля опционально связаны с django.contrib.auth.User — это даёт
нам готовый механизм логина, паролей и JWT (через SimpleJWT).

Студенту User нужен редко (чаще читаем список), учителю — обязательно
для входа в систему.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Teacher(models.Model):
    """Профиль учителя. Авторизация — через связанного auth.User."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="teacher_profile",
    )
    full_name = models.CharField(_("ФИО"), max_length=255)
    email = models.EmailField(_("Email"), blank=True)
    phone = models.CharField(_("Телефон"), max_length=32, blank=True)
    is_active = models.BooleanField(_("Активен"), default=True)
    kbp_teacher = models.OneToOneField(
        "academics.KbpTeacher",
        on_delete=models.SET_NULL,
        related_name="linked_teacher",
        verbose_name=_("Преподаватель kbp"),
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Учитель")
        verbose_name_plural = _("Учителя")
        ordering = ["full_name"]

    def __str__(self) -> str:
        return self.full_name


class Student(models.Model):
    """Профиль студента. Логин опционален."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="student_profile",
        null=True,
        blank=True,
    )
    full_name = models.CharField(_("ФИО"), max_length=255)
    record_book_number = models.CharField(
        _("Номер зачётной книжки"),
        max_length=32,
        unique=True,
    )
    birth_date = models.DateField(_("Дата рождения"), null=True, blank=True)
    email = models.EmailField(_("Email"), blank=True)
    phone = models.CharField(_("Телефон"), max_length=32, blank=True)
    is_active = models.BooleanField(_("Активен"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Студент")
        verbose_name_plural = _("Студенты")
        ordering = ["full_name"]

    def __str__(self) -> str:
        return f"{self.full_name} ({self.record_book_number})"


class AppAccount(models.Model):
    """Аккаунт приложения /app — вход через почту или Telegram."""

    class Gender(models.TextChoices):
        UNSPECIFIED = "", _("Не указан")
        MALE = "male", _("Мужской")
        FEMALE = "female", _("Женский")
        OTHER = "other", _("Другой")

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="app_account",
    )
    email = models.EmailField(_("Email"), unique=True, null=True, blank=True)
    telegram_id = models.BigIntegerField(_("Telegram ID"), unique=True, null=True, blank=True)
    telegram_username = models.CharField(_("Telegram"), max_length=64, blank=True)
    google_sub = models.CharField(_("Google sub"), max_length=64, unique=True, null=True, blank=True)
    display_name = models.CharField(_("Имя"), max_length=255, blank=True)
    nickname = models.CharField(_("Никнейм"), max_length=64, blank=True, default="")
    avatar_url = models.TextField(_("Аватар"), blank=True)
    phone = models.CharField(_("Телефон"), max_length=32, blank=True)
    gender = models.CharField(
        _("Пол"), max_length=16, choices=Gender.choices, blank=True, default=""
    )
    info = models.TextField(_("О себе"), blank=True)
    show_group = models.BooleanField(_("Показывать группу"), default=True)
    referral_source = models.CharField(_("Реферал"), max_length=64, blank=True)
    two_fa_enabled = models.BooleanField(_("2FA включена"), default=False)
    two_fa_secret = models.CharField(_("2FA secret"), max_length=64, blank=True)
    group = models.ForeignKey(
        "academics.Group",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="app_accounts",
        verbose_name=_("Группа"),
    )
    student = models.OneToOneField(
        Student,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="app_account",
    )
    group_verified_at = models.DateTimeField(_("Группа подтверждена"), null=True, blank=True)
    email_verified_at = models.DateTimeField(_("Email подтверждён"), null=True, blank=True)
    session_ttl_days = models.PositiveSmallIntegerField(_("TTL сессии (дни)"), default=30)
    profile_locked = models.BooleanField(_("Профиль заблокирован"), default=False)
    profile_locked_by = models.ForeignKey(
        Teacher,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="locked_app_accounts",
        verbose_name=_("Заблокировал"),
    )
    profile_locked_at = models.DateTimeField(_("Блокировка с"), null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Аккаунт приложения")
        verbose_name_plural = _("Аккаунты приложения")

    def __str__(self) -> str:
        return self.display_name or self.email or f"tg:{self.telegram_id}"


class AppSession(models.Model):
    """Серверная сессия ЛК (список устройств + паспорт-cookie)."""

    class DeviceKind(models.TextChoices):
        MOBILE = "mobile", _("Мобильное")
        WEB = "web", _("Веб")
        DESKTOP = "desktop", _("ПК")

    account = models.ForeignKey(
        AppAccount,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    session_key = models.CharField(_("Ключ"), max_length=64, unique=True, db_index=True)
    device_kind = models.CharField(
        _("Устройство"),
        max_length=16,
        choices=DeviceKind.choices,
        default=DeviceKind.WEB,
    )
    user_agent = models.CharField(_("User-Agent"), max_length=512, blank=True)
    ip_address = models.GenericIPAddressField(_("IP"), null=True, blank=True)
    trust_level = models.PositiveSmallIntegerField(_("Доверие"), default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(_("Истекает"))
    revoked_at = models.DateTimeField(_("Отозвана"), null=True, blank=True)
    quick_login_token = models.CharField(_("Быстрый вход"), max_length=64, blank=True, db_index=True)

    class Meta:
        verbose_name = _("Сессия приложения")
        verbose_name_plural = _("Сессии приложения")
        ordering = ["-last_seen"]

    @property
    def is_active(self) -> bool:
        if self.revoked_at:
            return False
        return self.expires_at > timezone.now()

    def __str__(self) -> str:
        return f"{self.account_id}:{self.device_kind}:{self.session_key[:8]}"


class PushDevice(models.Model):
    """FCM-подписка мобильного клиента для push-уведомлений."""

    account = models.ForeignKey(
        AppAccount,
        on_delete=models.CASCADE,
        related_name="push_devices",
        null=True,
        blank=True,
    )
    device_id = models.CharField(_("ID устройства"), max_length=128, unique=True)
    fcm_token = models.TextField(_("FCM token"))
    platform = models.CharField(_("Платформа"), max_length=16, default="android")
    kbp_group_id = models.CharField(_("ID группы kbp.by"), max_length=64, blank=True)
    group_name = models.CharField(_("Группа"), max_length=128, blank=True)
    timetable_cat = models.CharField(
        _("Категория расписания"),
        max_length=32,
        blank=True,
        help_text=_("group|teacher|place|subject — последняя открытая сущность"),
    )
    timetable_entity_id = models.CharField(_("ID сущности расписания"), max_length=64, blank=True)
    timetable_entity_name = models.CharField(_("Имя сущности расписания"), max_length=255, blank=True)
    notify_timetable = models.BooleanField(_("Расписание"), default=True)
    notify_journal = models.BooleanField(_("Журнал"), default=False)
    active = models.BooleanField(_("Активна"), default=True)
    updated_at = models.DateTimeField(_("Обновлено"), auto_now=True)

    class Meta:
        verbose_name = _("Push-устройство")
        verbose_name_plural = _("Push-устройства")
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"{self.device_id[:12]}… ({self.group_name or '—'})"


class StaffSecuritySettings(models.Model):
    """PIN и настройки блокировки для staff (учитель/админ)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="staff_security",
        verbose_name=_("Пользователь"),
    )
    pin_hash = models.CharField(_("PIN hash"), max_length=128, blank=True)
    pin_updated_at = models.DateTimeField(_("PIN изменён"), null=True, blank=True)
    lock_enabled = models.BooleanField(_("Блокировка включена"), default=False)
    idle_lock_minutes = models.PositiveSmallIntegerField(_("Автоблокировка, мин"), default=5)

    class Meta:
        verbose_name = _("Безопасность staff")
        verbose_name_plural = _("Безопасность staff")

    def __str__(self) -> str:
        return f"StaffSecurity #{self.user_id}"


class StaffSessionState(models.Model):
    """Состояние блокировки staff-сессии на сервере."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="staff_session_state",
        verbose_name=_("Пользователь"),
    )
    locked = models.BooleanField(_("Заблокирован"), default=False)
    last_activity = models.DateTimeField(_("Последняя активность"), auto_now=True)
    unlock_push_token = models.CharField(_("Push unlock token"), max_length=64, blank=True)

    class Meta:
        verbose_name = _("Состояние staff-сессии")
        verbose_name_plural = _("Состояния staff-сессий")

    def __str__(self) -> str:
        return f"StaffSession #{self.user_id} locked={self.locked}"
