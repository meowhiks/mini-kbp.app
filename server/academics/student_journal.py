"""Сборка ответа журнала/опозданий для студента (формат UI /app)."""

from __future__ import annotations

from datetime import date, datetime

from .models import Grade, JournalDay, LatenessRecord, TeachingAssignment

MONTH_NAMES = [
    "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
]


def parse_birth_day(value: str) -> date | None:
    """DD.MM.YYYY → date."""
    try:
        return datetime.strptime(value.strip(), "%d.%m.%Y").date()
    except ValueError:
        return None


def surname_matches(full_name: str, surname: str) -> bool:
    sn = surname.strip().lower()
    if not sn:
        return False
    parts = full_name.strip().lower().split()
    return bool(parts and parts[0].startswith(sn[: max(1, len(sn))])) or sn in full_name.lower()


def _short_subject_name(subject) -> str:
    if subject.short_name:
        return subject.short_name
    words = subject.name.split()
    if len(words) >= 2:
        return "".join(w[0].upper() for w in words if w)[:10]
    name = subject.name.strip()
    return name[:12] if len(name) > 12 else name


def build_month_headers(date_keys: list[date]) -> tuple[list[str], list[int]]:
    months: list[str] = []
    colspans: list[int] = []
    last = ""
    for d in date_keys:
        m = MONTH_NAMES[d.month - 1]
        if m != last:
            months.append(m)
            colspans.append(1)
            last = m
        else:
            colspans[-1] += 1
    return months, colspans


def _collect_dates(student, group) -> list[date]:
    date_set: set[date] = set()
    assignments = TeachingAssignment.objects.filter(group=group, is_active=True)
    for a in assignments:
        for d in Grade.objects.filter(assignment=a, student=student).values_list("date", flat=True):
            date_set.add(d)
        for d in JournalDay.objects.filter(assignment=a).values_list("date", flat=True):
            date_set.add(d)
    return sorted(date_set)


def build_student_journal(student, group) -> dict:
    date_keys = _collect_dates(student, group)
    months, month_colspans = build_month_headers(date_keys)
    dates = [str(d.day) for d in date_keys]
    day_types, footer_notes, lab_due_dates, lab_credited, red_absent = _day_meta_for_group(group, date_keys)

    assignments = (
        TeachingAssignment.objects.filter(group=group, is_active=True)
        .select_related("subject")
        .order_by("subject__name", "id")
    )
    by_subject: dict[int, list] = {}
    for a in assignments:
        by_subject.setdefault(a.subject_id, []).append(a)

    subjects = []
    for subject_id in sorted(by_subject.keys(), key=lambda sid: by_subject[sid][0].subject.name):
        assign_list = by_subject[subject_id]
        assign_ids = [a.id for a in assign_list]
        canonical = assign_list[0]
        grades_matrix: dict[int, list[dict]] = {}
        nums: list[float] = []
        for idx, dk in enumerate(date_keys):
            day_grades = (
                Grade.objects.filter(assignment_id__in=assign_ids, student=student, date=dk)
                .exclude(value="")
                .order_by("slot", "id")
            )
            cells = [{"value": g.value.strip()} for g in day_grades if g.value.strip()]
            if cells:
                grades_matrix[idx] = cells
                for cell in cells:
                    try:
                        n = float(cell["value"].replace(",", "."))
                        if 0 <= n <= 10:
                            nums.append(n)
                    except ValueError:
                        pass
        avg = f"{sum(nums) / len(nums):.1f}" if nums else "-"
        short = _short_subject_name(canonical.subject)
        subjects.append(
            {
                "id": str(subject_id),
                "name": short,
                "shortName": short,
                "fullName": canonical.subject.name,
                "gradesMatrix": grades_matrix,
                "average": avg,
            }
        )

    return {
        "months": months,
        "monthColspans": month_colspans,
        "dates": dates,
        "dateKeys": [d.isoformat() for d in date_keys],
        "subjects": subjects,
        "dayTypes": day_types,
        "footerNotes": footer_notes,
        "labDueDates": lab_due_dates,
        "labCredited": lab_credited,
        "redAbsent": red_absent,
    }


def _day_meta_for_group(group, date_keys: list[date]) -> tuple[dict[int, str], dict[int, str], dict[int, str | None], dict[int, bool], dict[int, bool]]:
    day_types: dict[int, str] = {}
    footer_notes: dict[int, str] = {}
    lab_due_dates: dict[int, str | None] = {}
    lab_credited: dict[int, bool] = {}
    red_absent: dict[int, bool] = {}
    for idx, dk in enumerate(date_keys):
        days = JournalDay.objects.filter(
            assignment__group=group,
            assignment__is_active=True,
            date=dk,
        )
        types = list(days.values_list("day_type", flat=True))
        if "lab" in types:
            day_types[idx] = "lab"
        elif "okr" in types:
            day_types[idx] = "okr"
        else:
            day_types[idx] = "normal"
        for d in days:
            if d.footer_note:
                footer_notes[idx] = d.footer_note
                break
        for d in days:
            if d.lab_due_date:
                lab_due_dates[idx] = d.lab_due_date.isoformat()
            if d.lab_credited:
                lab_credited[idx] = True
            if d.red_absent:
                red_absent[idx] = True
    return day_types, footer_notes, lab_due_dates, lab_credited, red_absent


def build_student_lateness(student, group) -> dict:
    records = list(
        LatenessRecord.objects.filter(group=group, student=student, minutes__gt=0).order_by("date", "slot")
    )
    keys = sorted({(r.date, r.slot) for r in records})
    date_keys = [k[0] for k in keys]
    months, month_colspans = build_month_headers(date_keys)
    dates = [str(d.day) for d in date_keys]

    by_key = {(r.date, r.slot): r for r in records}
    lateness_matrix: dict[int, list[dict]] = {}
    for idx, (dk, slot) in enumerate(keys):
        r = by_key.get((dk, slot))
        if r:
            lateness_matrix[idx] = [{"value": f"{r.minutes}м", "type": "Опоздание"}]

    subjects = [
        {
            "id": "lateness",
            "name": "Опоздания",
            "latenessMatrix": lateness_matrix,
        }
    ] if lateness_matrix else []

    return {
        "months": months,
        "monthColspans": month_colspans,
        "dates": dates,
        "subjects": subjects,
    }
