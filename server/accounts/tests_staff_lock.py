"""Tests for staff session lock."""

from django.contrib.auth.models import User
from django.test import TestCase, RequestFactory
from rest_framework.test import APIClient

from accounts.models import StaffSecuritySettings, StaffSessionState, Teacher
from accounts.staff_security_views import _pin_hash


class StaffLockTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("staff1", password="SecretPass1!")
        self.teacher = Teacher.objects.create(user=self.user, full_name="Staff")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_set_pin_and_unlock(self):
        settings_obj = StaffSecuritySettings.objects.create(user=self.user, lock_enabled=True)
        settings_obj.pin_hash = _pin_hash("1234", self.user.pk)
        settings_obj.save()
        StaffSessionState.objects.create(user=self.user, locked=True)

        bad = self.client.post("/v0/staff-security/unlock/", {"pin": "0000"}, format="json")
        self.assertEqual(bad.status_code, 403)

        ok = self.client.post("/v0/staff-security/unlock/", {"pin": "1234"}, format="json")
        self.assertEqual(ok.status_code, 200)
        state = StaffSessionState.objects.get(user=self.user)
        self.assertFalse(state.locked)

    def test_unlock_with_password(self):
        StaffSessionState.objects.create(user=self.user, locked=True)
        resp = self.client.post(
            "/v0/staff-security/unlock-password/",
            {"password": "SecretPass1!"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

    def test_status_endpoint(self):
        resp = self.client.get("/v0/staff-security/status/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("locked", resp.json())
        self.assertIn("pin_updated_at", resp.json())

    def test_pin_updated_at_set_when_pin_saved(self):
        resp = self.client.patch(
            "/v0/staff-security/settings/",
            {"lock_enabled": True, "pin": "1234"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        settings_resp = self.client.get("/v0/staff-security/settings/")
        self.assertIsNotNone(settings_resp.json().get("pin_updated_at"))
