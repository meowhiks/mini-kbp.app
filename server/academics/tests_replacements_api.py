"""API тесты пакетов замен (без vision)."""

import datetime as dt

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from academics.kbp_catalog import KbpGroup
from academics.replacements import ReplacementEntry, ReplacementScanBatch
from accounts.models import AppAccount

User = get_user_model()


class ReplacementApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username="repl_admin", password="AdminPass1!", is_staff=True
        )
        self.user = User.objects.create_user(username="repl_user", password="UserPass1!")
        AppAccount.objects.create(user=self.user, email="repl@test.by", display_name="Repl")
        AppAccount.objects.create(user=self.staff, email="repladmin@test.by", display_name="Admin")
        self.kbp_group = KbpGroup.objects.create(kbp_id="591", name="591Т")

    def _make_draft(self) -> ReplacementScanBatch:
        batch = ReplacementScanBatch.objects.create(
            date=dt.date(2026, 9, 4),
            day_of_week="ПЯТНИЦА",
            status=ReplacementScanBatch.Status.DRAFT,
            created_by=self.staff,
        )
        ReplacementEntry.objects.create(
            batch=batch,
            group_code="591Т",
            kbp_group=self.kbp_group,
            lesson_number=7,
            event_type=ReplacementEntry.EventType.REPLACEMENT,
            replacement_data={
                "subject": "ОхрОкрСрЭнерг",
                "room": "319",
                "teachers": ["Янушкевич Е.В."],
            },
            original_data={"subject": "ИнтрументПО", "room": None, "teachers": []},
            sort_order=0,
        )
        ReplacementEntry.objects.create(
            batch=batch,
            group_code="591Т",
            kbp_group=self.kbp_group,
            lesson_number=8,
            event_type=ReplacementEntry.EventType.NEW_LESSON,
            replacement_data={
                "subject": "ОхрОкрСрЭнерг",
                "room": "319",
                "teachers": ["Янушкевич Е.В."],
            },
            original_data={"subject": None, "room": None, "teachers": []},
            sort_order=1,
        )
        return batch

    def test_scan_requires_staff(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/v0/replacements/scan/", {}, format="multipart")
        self.assertEqual(resp.status_code, 403)

    def test_scan_without_vision_key_returns_503(self):
        self.client.force_authenticate(user=self.staff)
        resp = self.client.post("/v0/replacements/scan/", {}, format="multipart")
        self.assertEqual(resp.status_code, 503)

    def test_get_patch_publish_and_overlay(self):
        batch = self._make_draft()
        self.client.force_authenticate(user=self.staff)

        detail = self.client.get(f"/v0/replacements/{batch.id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(len(detail.data["entries"]), 2)

        patch = self.client.patch(
            f"/v0/replacements/{batch.id}/",
            {
                "entries": [
                    {
                        "group_code": "591Т",
                        "lesson_number": 11,
                        "event_type": "CANCELLATION",
                        "replacement_data": {"subject": None, "room": None, "teachers": []},
                        "original_data": {
                            "subject": "ОргПроизвод",
                            "room": "520",
                            "teachers": ["Свирид Д.И."],
                        },
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(len(patch.data["entries"]), 1)
        self.assertEqual(patch.data["entries"][0]["event_type"], "CANCELLATION")

        pub = self.client.post(f"/v0/replacements/{batch.id}/publish/")
        self.assertEqual(pub.status_code, 200)
        self.assertEqual(pub.data["status"], "published")

        self.client.force_authenticate(user=self.user)
        overlay = self.client.get("/v0/replacements/overlay/?from=2026-09-04&to=2026-09-04")
        self.assertEqual(overlay.status_code, 200)
        day = overlay.data["days"].get("2026-09-04") or []
        self.assertEqual(len(day), 1)
        self.assertEqual(day[0]["event_type"], "CANCELLATION")
        self.assertEqual(day[0]["kbp_group_id"], "591")

        self.client.force_authenticate(user=self.staff)
        unpub = self.client.post(f"/v0/replacements/{batch.id}/unpublish/")
        self.assertEqual(unpub.status_code, 200)
        self.assertEqual(unpub.data["status"], "draft")
        self.assertIsNone(unpub.data["published_at"])

        self.client.force_authenticate(user=self.user)
        overlay2 = self.client.get("/v0/replacements/overlay/?from=2026-09-04&to=2026-09-04")
        self.assertEqual(overlay2.status_code, 200)
        self.assertEqual(overlay2.data["days"].get("2026-09-04") or [], [])

    def test_non_staff_cannot_list_batches(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/v0/replacements/")
        self.assertEqual(resp.status_code, 403)

    def test_staff_list_batches(self):
        self._make_draft()
        self.client.force_authenticate(user=self.staff)
        resp = self.client.get("/v0/replacements/")
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(len(resp.data), 1)

    def test_import_json_creates_draft_with_checkmark_rules(self):
        self.client.force_authenticate(user=self.staff)
        payload = {
            "schedule_info": {
                "day_of_week": "ПЯТНИЦА",
                "date": "04.09.26г.",
                "signed_by": "Зам. директора по УР",
            },
            "replacements": [
                {
                    "group_code": "491П",
                    "lesson_number": 7,
                    "subject": "ВебПрогСтСерв",
                    "room": "410",
                    "teachers": ["Шкабура А.Д."],
                },
                {
                    "group_code": "491П",
                    "lesson_number": 8,
                    "subject": "√",
                    "room": "√",
                    "teachers": ["√"],
                },
            ],
        }
        resp = self.client.post("/v0/replacements/import/", payload, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["status"], "draft")
        self.assertEqual(resp.data["date"], "2026-09-04")
        self.assertEqual(len(resp.data["entries"]), 2)
        self.assertEqual(resp.data["entries"][0]["event_type"], "REPLACEMENT")
        self.assertEqual(resp.data["entries"][1]["event_type"], "REPLACEMENT")
        self.assertEqual(
            resp.data["entries"][1]["replacement_data"]["subject"], "ВебПрогСтСерв"
        )

    def test_import_requires_staff(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            "/v0/replacements/import/",
            {"schedule_info": {}, "replacements": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
