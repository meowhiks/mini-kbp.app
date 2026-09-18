"""TDD: нормализация OCR листа замен."""

from django.test import SimpleTestCase

from academics.replacement_ocr import (
    EVENT_CANCEL,
    EVENT_REPLACE,
    expand_lesson_numbers,
    is_checkmark,
    normalize_ocr_replacements,
    parse_sheet_date,
)


class CheckmarkAndDateTests(SimpleTestCase):
    def test_checkmark_tokens(self):
        for t in ("√", "V", "v", "✓", "√."):
            self.assertTrue(is_checkmark(t), t)
        self.assertFalse(is_checkmark("Математика"))
        self.assertFalse(is_checkmark(""))

    def test_parse_sheet_date(self):
        self.assertEqual(parse_sheet_date("04.09.26г."), "2026-09-04")
        self.assertEqual(parse_sheet_date("4.9.2026"), "2026-09-04")
        self.assertEqual(parse_sheet_date("2026-09-04"), "2026-09-04")
        self.assertIsNone(parse_sheet_date("не дата"))

    def test_expand_lesson_numbers(self):
        self.assertEqual(expand_lesson_numbers("9-10"), [9, 10])
        self.assertEqual(expand_lesson_numbers("9–10"), [9, 10])
        self.assertEqual(expand_lesson_numbers(7), [7])
        self.assertEqual(expand_lesson_numbers("7"), [7])
        self.assertEqual(expand_lesson_numbers("11-12"), [11, 12])


class NormalizeOcrReplacementsTests(SimpleTestCase):
    def test_flat_row_is_replacement_checkmark_carry(self):
        """Лист: только «что ставим»; √ тянется с предыдущей строки той же группы."""
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
        out = normalize_ocr_replacements(payload)
        self.assertEqual(out["schedule_info"]["date"], "2026-09-04")
        self.assertEqual(len(out["replacements"]), 2)

        r0 = out["replacements"][0]
        self.assertEqual(r0["event_type"], EVENT_REPLACE)
        self.assertEqual(r0["replacement_data"]["subject"], "ВебПрогСтСерв")
        self.assertIsNone(r0["original_data"]["subject"])

        r1 = out["replacements"][1]
        self.assertEqual(r1["event_type"], EVENT_REPLACE)
        self.assertEqual(r1["replacement_data"]["subject"], "ВебПрогСтСерв")
        self.assertEqual(r1["replacement_data"]["room"], "410")
        self.assertEqual(r1["replacement_data"]["teachers"], ["Шкабура А.Д."])

    def test_ignores_original_data_from_payload(self):
        payload = {
            "schedule_info": {"date": "2026-09-04"},
            "replacements": [
                {
                    "group_code": "591Т",
                    "lesson_number": 7,
                    "replacement_data": {
                        "subject": "Новый",
                        "room": "1",
                        "teachers": ["T"],
                    },
                    "original_data": {
                        "subject": "Старый",
                        "room": "2",
                        "teachers": ["X"],
                    },
                }
            ],
        }
        out = normalize_ocr_replacements(payload)
        r = out["replacements"][0]
        self.assertEqual(r["event_type"], EVENT_REPLACE)
        self.assertEqual(r["replacement_data"]["subject"], "Новый")
        self.assertIsNone(r["original_data"]["subject"])

    def test_cancellation_urok_snyat(self):
        payload = {
            "schedule_info": {"date": "2026-09-04"},
            "replacements": [
                {
                    "group_code": "512Э",
                    "lesson_number": 11,
                    "subject": "Урок снят",
                    "room": None,
                    "teachers": [],
                }
            ],
        }
        out = normalize_ocr_replacements(payload)
        r = out["replacements"][0]
        self.assertEqual(r["event_type"], EVENT_CANCEL)
        self.assertIsNone(r["replacement_data"]["subject"])

    def test_lesson_range_expands_to_two_rows(self):
        payload = {
            "schedule_info": {"date": "01.09.26"},
            "replacements": [
                {
                    "group_code": "101",
                    "lesson_number": "9-10",
                    "subject": "Математика",
                    "room": "101",
                    "teachers": ["Иванов"],
                }
            ],
        }
        out = normalize_ocr_replacements(payload)
        self.assertEqual(len(out["replacements"]), 2)
        self.assertEqual(out["replacements"][0]["lesson_number"], 9)
        self.assertEqual(out["replacements"][1]["lesson_number"], 10)
        self.assertEqual(out["replacements"][0]["event_type"], EVENT_REPLACE)

    def test_carry_forward_only_same_group_skips_orphan_checkmark(self):
        payload = {
            "replacements": [
                {
                    "group_code": "A",
                    "lesson_number": 1,
                    "subject": "Химия",
                    "room": "1",
                    "teachers": ["T1"],
                },
                {
                    "group_code": "B",
                    "lesson_number": 1,
                    "subject": "√",
                    "room": "√",
                    "teachers": ["√"],
                },
            ]
        }
        out = normalize_ocr_replacements(payload)
        # B cannot inherit from A → пустая строка пропускается
        self.assertEqual(len(out["replacements"]), 1)
        self.assertEqual(out["replacements"][0]["group_code"], "A")

    def test_v_token_as_checkmark_in_replacement(self):
        payload = {
            "replacements": [
                {
                    "group_code": "G",
                    "lesson_number": 1,
                    "subject": "История",
                    "room": "200",
                    "teachers": ["Петров"],
                },
                {
                    "group_code": "G",
                    "lesson_number": 2,
                    "subject": "V",
                    "room": "v",
                    "teachers": "✓",
                },
            ]
        }
        out = normalize_ocr_replacements(payload)
        r1 = out["replacements"][1]
        self.assertEqual(r1["event_type"], EVENT_REPLACE)
        self.assertEqual(r1["replacement_data"]["subject"], "История")
        self.assertEqual(r1["replacement_data"]["room"], "200")
        self.assertEqual(r1["replacement_data"]["teachers"], ["Петров"])
