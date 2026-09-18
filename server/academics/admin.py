from django.contrib import admin

from .models import (
    Group,
    Subject,
    Enrollment,
    TeachingAssignment,
    Grade,
    CuratorInviteCode,
    JournalBackup,
    KbpGroup,
    KbpTeacher,
    KbpSubject,
    KbpPlace,
    KbpTeachingLink,
    ReplacementEntry,
    ReplacementScanBatch,
)


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("name", "short_name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "short_name")


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ("student", "group", "enrolled_at", "is_active")
    list_filter = ("is_active", "group")
    search_fields = ("student__full_name", "group__name")
    autocomplete_fields = ("student", "group")


@admin.register(TeachingAssignment)
class TeachingAssignmentAdmin(admin.ModelAdmin):
    list_display = (
        "teacher",
        "group",
        "subject",
        "lesson_type",
        "semester",
        "hours_per_week",
        "is_active",
    )
    list_filter = ("lesson_type", "semester", "is_active", "subject")
    search_fields = (
        "teacher__full_name",
        "group__name",
        "subject__name",
    )
    autocomplete_fields = ("teacher", "group", "subject")


@admin.register(Grade)
class GradeAdmin(admin.ModelAdmin):
    list_display = ("student", "assignment", "date", "value", "updated_at")
    list_filter = ("date", "assignment__group", "assignment__subject")
    search_fields = (
        "student__full_name",
        "assignment__group__name",
        "assignment__subject__name",
    )
    autocomplete_fields = ("assignment", "student")
    date_hierarchy = "date"


@admin.register(CuratorInviteCode)
class CuratorInviteCodeAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "role",
        "group",
        "kbp_teacher",
        "created_by",
        "expires_at",
        "use_count",
        "max_uses",
        "is_active",
    )
    list_filter = ("is_active", "role", "group")
    search_fields = ("code", "group__name", "kbp_teacher__name")
    autocomplete_fields = ("group", "kbp_teacher", "created_by")


@admin.register(JournalBackup)
class JournalBackupAdmin(admin.ModelAdmin):
    list_display = ("backup_date", "compressed_bytes", "uncompressed_bytes", "created_at")
    readonly_fields = ("backup_date", "payload_gz", "uncompressed_bytes", "compressed_bytes", "stats", "created_at")

    def has_delete_permission(self, request, obj=None):
        return False

    def has_add_permission(self, request):
        return False


@admin.register(KbpGroup)
class KbpGroupAdmin(admin.ModelAdmin):
    list_display = ("name", "kbp_id", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "kbp_id")


@admin.register(KbpTeacher)
class KbpTeacherAdmin(admin.ModelAdmin):
    list_display = ("name", "kbp_id", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "kbp_id")


@admin.register(KbpSubject)
class KbpSubjectAdmin(admin.ModelAdmin):
    list_display = ("name", "kbp_id", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "kbp_id")


@admin.register(KbpPlace)
class KbpPlaceAdmin(admin.ModelAdmin):
    list_display = ("name", "kbp_id", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "kbp_id")


@admin.register(KbpTeachingLink)
class KbpTeachingLinkAdmin(admin.ModelAdmin):
    list_display = ("teacher", "group", "subject", "place", "last_seen_at")
    list_filter = ("source",)
    search_fields = ("teacher__name", "group__name", "subject__name")
    autocomplete_fields = ("teacher", "group", "subject", "place")


class ReplacementEntryInline(admin.TabularInline):
    model = ReplacementEntry
    extra = 0
    autocomplete_fields = ("kbp_group", "kbp_subject", "kbp_teacher", "kbp_place")


@admin.register(ReplacementScanBatch)
class ReplacementScanBatchAdmin(admin.ModelAdmin):
    list_display = ("id", "date", "status", "created_by", "published_at", "created_at")
    list_filter = ("status",)
    search_fields = ("id", "day_of_week", "signed_by")
    inlines = [ReplacementEntryInline]


@admin.register(ReplacementEntry)
class ReplacementEntryAdmin(admin.ModelAdmin):
    list_display = ("id", "batch", "group_code", "lesson_number", "event_type")
    list_filter = ("event_type",)
    search_fields = ("group_code",)
    autocomplete_fields = ("batch", "kbp_group", "kbp_subject", "kbp_teacher", "kbp_place")
