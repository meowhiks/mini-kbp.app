"""Shared DRF permission classes for MiniKBP API."""

from __future__ import annotations

from rest_framework import permissions


class IsStaffUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class IsStaffOrTeacherMe(permissions.BasePermission):
    """Staff для CRUD; любой JWT — только action `me`."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if getattr(view, "action", None) == "me":
            return True
        return request.user.is_staff
