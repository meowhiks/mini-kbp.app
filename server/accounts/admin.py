from django.contrib import admin

from .models import Teacher, Student, AppAccount


@admin.register(AppAccount)
class AppAccountAdmin(admin.ModelAdmin):
    list_display = ("display_name", "email", "student", "telegram_id", "group", "two_fa_enabled", "created_at")
    search_fields = ("email", "display_name", "telegram_username", "student__full_name")
    list_filter = ("two_fa_enabled", "group")
    autocomplete_fields = ("student", "group", "user")


@admin.register(Teacher)
class TeacherAdmin(admin.ModelAdmin):
    list_display = ("full_name", "email", "phone", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("full_name", "email", "user__username")
    autocomplete_fields = ("user",)


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ("full_name", "record_book_number", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("full_name", "record_book_number")