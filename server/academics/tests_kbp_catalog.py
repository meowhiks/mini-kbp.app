"""Тесты парсера и sync каталога kbp."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from academics.kbp_catalog import KbpGroup, KbpSubject, KbpTeacher, KbpTeachingLink
from academics.kbp_sync import (
    parse_pair_refs,
    parse_search_index,
    run_sync,
    sync_entities_from_index,
    sync_links_for_group,
    SearchEntity,
)
from accounts.models import AppAccount, Teacher

User = get_user_model()

INDEX_HTML = """
<html><body>
<div class="find_block">
<div><span class="type_find">группа</span>
<a href="?cat=group&amp;id=101">Т-691</a></div>
<div><span class="type_find">преподаватель</span>
<a href="?cat=teacher&amp;id=55">Иванов И.И.</a></div>
<div><span class="type_find">предмет</span>
<a href="?cat=subject&amp;id=9">Математика</a></div>
<div><span class="type_find">аудитория</span>
<a href="?cat=place&amp;id=3">301</a></div>
</div></div>
</body></html>
"""

PAIR_HTML = """
<div class="pair">
  <div class="subject"><a href="?cat=subject&amp;id=9">Математика</a></div>
  <div class="left-column">
    <div class="teacher"><a href="?cat=teacher&amp;id=55">Иванов И.И.</a></div>
  </div>
  <div class="right-column">
    <div class="place"><a href="?cat=place&amp;id=3">301</a></div>
    <div class="group"><a href="?cat=group&amp;id=101">Т-691</a></div>
  </div>
</div>
"""


class KbpParseTests(TestCase):
    def test_parse_search_index(self):
        items = parse_search_index(INDEX_HTML)
        by_kind = {e.kind: e for e in items}
        self.assertEqual(len(items), 4)
        self.assertEqual(by_kind["group"].kbp_id, "101")
        self.assertEqual(by_kind["group"].name, "Т-691")
        self.assertEqual(by_kind["teacher"].name, "Иванов И.И.")
        self.assertEqual(by_kind["subject"].kbp_id, "9")
        self.assertEqual(by_kind["place"].kbp_id, "3")

    def test_parse_pair_refs(self):
        refs = parse_pair_refs(PAIR_HTML)
        self.assertEqual(len(refs), 1)
        r = refs[0]
        self.assertEqual(r.subject_id, "9")
        self.assertEqual(r.teacher_ids, (("55", "Иванов И.И."),))
        self.assertEqual(r.place_id, "3")
        self.assertEqual(r.group_id, "101")


class KbpSyncUpsertTests(TestCase):
    def test_sync_entities_idempotent(self):
        entities = [
            SearchEntity("group", "101", "Т-691"),
            SearchEntity("teacher", "55", "Иванов И.И."),
            SearchEntity("subject", "9", "Математика"),
            SearchEntity("place", "3", "301"),
        ]
        sync_entities_from_index(entities)
        sync_entities_from_index(entities)
        self.assertEqual(KbpGroup.objects.count(), 1)
        self.assertEqual(KbpTeacher.objects.count(), 1)
        g = KbpGroup.objects.get(kbp_id="101")
        self.assertTrue(g.is_active)
        self.assertEqual(g.name, "Т-691")

    def test_deactivates_missing(self):
        KbpTeacher.objects.create(kbp_id="99", name="Старый", is_active=True)
        sync_entities_from_index([SearchEntity("teacher", "55", "Новый")])
        self.assertFalse(KbpTeacher.objects.get(kbp_id="99").is_active)
        self.assertTrue(KbpTeacher.objects.get(kbp_id="55").is_active)

    def test_sync_links_for_group(self):
        group = KbpGroup.objects.create(kbp_id="101", name="Т-691")
        n = sync_links_for_group(group, PAIR_HTML)
        self.assertEqual(n, 1)
        link = KbpTeachingLink.objects.get()
        self.assertEqual(link.teacher.kbp_id, "55")
        self.assertEqual(link.subject.kbp_id, "9")
        self.assertEqual(link.group.kbp_id, "101")
        self.assertEqual(link.place.kbp_id, "3")

    def test_run_sync_with_mock_fetch(self):
        def fetch(url: str) -> str:
            if "q=" in url:
                return INDEX_HTML
            return PAIR_HTML

        stats = run_sync(fetch=fetch, delay_sec=0, limit=1)
        self.assertEqual(stats.entities_upserted, 4)
        self.assertEqual(stats.groups_fetched, 1)
        self.assertGreaterEqual(stats.links_upserted, 1)
        self.assertEqual(KbpTeachingLink.objects.count(), 1)


class KbpInviteClaimTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="kbp_admin",
            email="kbp_admin@test.by",
            password="AdminPass123!",
            is_staff=True,
        )
        AppAccount.objects.create(
            user=self.admin,
            email="kbp_admin@test.by",
            display_name="Admin",
            email_verified_at=timezone.now(),
        )
        self.kbp_teacher = KbpTeacher.objects.create(kbp_id="55", name="Иванов И.И.")
        login = self.client.post(
            "/v0/auth/app/login/",
            {"email": "kbp_admin@test.by", "password": "AdminPass123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200, login.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _register_pending(self, email: str) -> str:
        import re

        from django.core import mail

        reg = self.client.post(
            "/v0/auth/app/register/",
            {"email": email, "password": "GoodPass123!", "password_confirm": "GoodPass123!"},
            format="json",
        )
        self.assertEqual(reg.status_code, 200, reg.data)
        self.assertTrue(reg.data.get("needs_email_verify"))
        dev_code = reg.data.get("dev_code")
        if not dev_code:
            self.assertGreaterEqual(len(mail.outbox), 1)
            match = re.search(r"(\d{6})", mail.outbox[-1].body)
            self.assertIsNotNone(match)
            dev_code = match.group(1)
        verify_email = self.client.post(
            "/v0/auth/app/verify-email/",
            {"email": email, "code": dev_code},
            format="json",
        )
        self.assertEqual(verify_email.status_code, 200, verify_email.data)
        self.assertTrue(verify_email.data.get("pending_token"))
        return verify_email.data["pending_token"]

    def test_create_invite_with_kbp_teacher(self):
        r = self.client.post(
            "/v0/role-invite-codes/",
            {
                "role": "teacher",
                "kbp_teacher_id": self.kbp_teacher.id,
                "expires_days": 7,
                "max_uses": 1,
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["kbp_teacher_id"], self.kbp_teacher.id)
        self.assertEqual(r.data["kbp_teacher_name"], "Иванов И.И.")

    def test_catalog_teachers_list(self):
        r = self.client.get("/v0/kbp-catalog/teachers/?q=Иван")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]["kbp_id"], "55")
        self.assertFalse(r.data[0]["linked"])

    def test_redeem_links_teacher(self):
        from datetime import timedelta

        from academics.models import CuratorInviteCode

        CuratorInviteCode.objects.create(
            role=CuratorInviteCode.Role.TEACHER,
            code="KBPTE1",
            kbp_teacher=self.kbp_teacher,
            expires_at=timezone.now() + timedelta(days=7),
            max_uses=1,
        )
        pending = self._register_pending("claim@test.by")
        r = self.client.post(
            "/v0/auth/app/verify/",
            {"pending_token": pending, "curator_code": "KBPTE1"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["role"], "teacher")
        self.assertEqual(r.data.get("kbp_teacher_id"), self.kbp_teacher.id)
        user = User.objects.get(email="claim@test.by")
        teacher = Teacher.objects.get(user=user)
        self.assertEqual(teacher.kbp_teacher_id, self.kbp_teacher.id)
        self.assertEqual(teacher.full_name, "Иванов И.И.")

    def test_second_claim_rejected(self):
        from datetime import timedelta

        from academics.models import CuratorInviteCode

        other = User.objects.create_user(username="other", email="o@test.by", password="OtherPass123!")
        Teacher.objects.create(user=other, full_name="Taken", kbp_teacher=self.kbp_teacher)

        CuratorInviteCode.objects.create(
            role=CuratorInviteCode.Role.TEACHER,
            code="KBPTE2",
            kbp_teacher=self.kbp_teacher,
            expires_at=timezone.now() + timedelta(days=7),
            max_uses=1,
        )
        pending = self._register_pending("claim2@test.by")
        r = self.client.post(
            "/v0/auth/app/verify/",
            {"pending_token": pending, "curator_code": "KBPTE2"},
            format="json",
        )
        self.assertEqual(r.status_code, 400, r.data)
        self.assertIn("привязан", r.data.get("detail", ""))
        invite = CuratorInviteCode.objects.get(code="KBPTE2")
        self.assertEqual(invite.use_count, 0)
