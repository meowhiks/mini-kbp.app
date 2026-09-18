from django.test import TestCase

from academics.kbp_catalog import KbpGroup, KbpPlace, KbpSubject, KbpTeacher
from academics.replacement_match import (
    group_identity,
    match_kbp_group,
    match_kbp_place,
    match_kbp_subject,
    match_kbp_teacher,
    normalize_room_token,
)


class ReplacementMatchTests(TestCase):
    def setUp(self):
        self.group = KbpGroup.objects.create(kbp_id="494", name="Т-494")
        self.subject = KbpSubject.objects.create(kbp_id="1", name="ВебПрогСтСерв")
        self.teacher = KbpTeacher.objects.create(kbp_id="2", name="Шкабура А.Д.")
        self.place = KbpPlace.objects.create(kbp_id="3", name="410")

    def test_group_identity_prefix_and_suffix(self):
        self.assertEqual(group_identity("П-491"), "491п")
        self.assertEqual(group_identity("п491"), "491п")
        self.assertEqual(group_identity("491П"), "491п")
        self.assertEqual(group_identity("491-п"), "491п")
        self.assertEqual(group_identity("Т-494"), "494т")
        self.assertEqual(group_identity("494п"), "494п")

    def test_group_with_hyphen(self):
        self.assertEqual(match_kbp_group("Т-494"), self.group)
        self.assertEqual(match_kbp_group("Т494"), self.group)
        self.assertEqual(match_kbp_group("494Т"), self.group)
        self.assertEqual(match_kbp_group("494т"), self.group)

    def test_group_p_491_kbp_style(self):
        g = KbpGroup.objects.create(kbp_id="491", name="П-491")
        self.assertEqual(match_kbp_group("П-491"), g)
        self.assertEqual(match_kbp_group("п-491"), g)
        self.assertEqual(match_kbp_group("491П"), g)
        self.assertEqual(match_kbp_group("491п"), g)
        self.assertEqual(match_kbp_group("491-П"), g)
        # Т-494 ≠ 494п (другая буква)
        self.assertIsNone(match_kbp_group("494п"))

    def test_subject_abbrev(self):
        self.assertEqual(match_kbp_subject("ВебПрогСтСерв"), self.subject)

    def test_teacher_initials(self):
        self.assertEqual(match_kbp_teacher("Шкабура А.Д."), self.teacher)

    def test_room_strips_aud_prefix(self):
        self.assertEqual(normalize_room_token("ауд. 410"), "410")
        self.assertEqual(match_kbp_place("ауд. 410"), self.place)
        self.assertEqual(match_kbp_place("Ауд.410"), self.place)
        self.assertEqual(match_kbp_place("410"), self.place)
