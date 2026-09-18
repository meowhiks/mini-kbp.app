"""Аналитика для админ-панели."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from django.db.models import Count, Q
from django.db.models.functions import TruncDate, TruncWeek
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsStaffUser
from accounts.models import AppAccount, AppSession, Student, Teacher

from .models import Grade, Group, TeachingAssignment, Enrollment


def _parse_grade_value(raw: str) -> float | None:
    v = (raw or "").strip().replace(",", ".")
    if not v or v.upper() in ("Н", "ОП", "НБ", "—", "-"):
        return None
    try:
        n = float(v)
        if 1 <= n <= 10:
            return n
    except ValueError:
        pass
    return None


def _avg(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def _pct_delta(current: float | int, previous: float | int) -> float | None:
    if previous == 0:
        return 100.0 if current else 0.0
    return round((float(current) - float(previous)) / float(previous) * 100, 1)


def _resolve_period(request) -> tuple[datetime, datetime, datetime, datetime, str]:
    """Текущий и предыдущий интервал (aware datetimes)."""
    period = (request.query_params.get("period") or "week").strip().lower()
    now = timezone.now()
    today = timezone.localdate()

    if period == "today":
        start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        end = now
        prev_end = start
        prev_start = prev_end - timedelta(days=1)
        return start, end, prev_start, prev_end, period

    if period == "custom":
        raw_from = request.query_params.get("from")
        raw_to = request.query_params.get("to")
        d_from = date.fromisoformat(raw_from) if raw_from else today - timedelta(days=7)
        d_to = date.fromisoformat(raw_to) if raw_to else today
        start = timezone.make_aware(datetime.combine(d_from, datetime.min.time()))
        end = timezone.make_aware(datetime.combine(d_to, datetime.max.time()))
        span = end - start
        prev_end = start
        prev_start = prev_end - span
        return start, end, prev_start, prev_end, period

    days_map = {"week": 7, "month": 30, "2months": 60}
    days = days_map.get(period, 7)
    start = now - timedelta(days=days)
    end = now
    prev_end = start
    prev_start = prev_end - timedelta(days=days)
    return start, end, prev_start, prev_end, period


def _grade_stats(start: datetime, end: datetime) -> dict:
    qs = Grade.objects.filter(updated_at__gte=start, updated_at__lte=end)
    count = qs.count()
    nums = [_parse_grade_value(v) for v in qs.values_list("value", flat=True)]
    nums = [n for n in nums if n is not None]
    return {"count": count, "average": _avg(nums)}


def _grade_series(start: datetime, end: datetime, period_key: str) -> list[dict]:
    qs = Grade.objects.filter(updated_at__gte=start, updated_at__lte=end)
    span_days = (end - start).days
    use_weekly = span_days > 14 or period_key == "2months"

    if use_weekly:
        buckets = (
            qs.annotate(bucket=TruncWeek("updated_at"))
            .values("bucket")
            .annotate(c=Count("id"))
            .order_by("bucket")
        )
        series = []
        for row in buckets:
            b = row["bucket"]
            label = b.strftime("%d.%m") if b else "?"
            sub = qs.filter(updated_at__gte=b, updated_at__lt=b + timedelta(days=7)) if b else qs.none()
            nums = [_parse_grade_value(v) for v in sub.values_list("value", flat=True)]
            nums = [n for n in nums if n is not None]
            series.append({"label": label, "count": row["c"], "average": _avg(nums)})
        return series

    buckets = (
        qs.annotate(bucket=TruncDate("updated_at"))
        .values("bucket")
        .annotate(c=Count("id"))
        .order_by("bucket")
    )
    series = []
    for row in buckets:
        b = row["bucket"]
        label = b.strftime("%d.%m") if b else "?"
        sub = qs.filter(updated_at__date=b) if b else qs.none()
        nums = [_parse_grade_value(v) for v in sub.values_list("value", flat=True)]
        nums = [n for n in nums if n is not None]
        series.append({"label": label, "count": row["c"], "average": _avg(nums)})
    return series


def _registration_series(start: datetime, end: datetime) -> list[dict]:
    qs = AppAccount.objects.filter(created_at__gte=start, created_at__lte=end)
    buckets = (
        qs.annotate(bucket=TruncDate("created_at"))
        .values("bucket")
        .annotate(c=Count("id"))
        .order_by("bucket")
    )
    return [{"label": r["bucket"].strftime("%d.%m") if r["bucket"] else "?", "count": r["c"]} for r in buckets]


def _active_users(since: datetime) -> int:
    return (
        AppSession.objects.filter(last_seen__gte=since, revoked_at__isnull=True)
        .values("account_id")
        .distinct()
        .count()
    )


def _groups_table(start: datetime, end: datetime) -> list[dict]:
    groups = list(Group.objects.filter(is_active=True).values("id", "name"))
    if not groups:
        return []

    group_ids = [g["id"] for g in groups]

    enrollment_counts = dict(
        Enrollment.objects.filter(group_id__in=group_ids, is_active=True)
        .values("group_id")
        .annotate(c=Count("id"))
        .values_list("group_id", "c")
    )

    grade_counts = dict(
        Grade.objects.filter(
            assignment__group_id__in=group_ids,
            updated_at__gte=start,
            updated_at__lte=end,
        )
        .values("assignment__group_id")
        .annotate(c=Count("id"))
        .values_list("assignment__group_id", "c")
    )

    grades_by_group: dict[int, list[float]] = defaultdict(list)
    for group_id, value in Grade.objects.filter(
        assignment__group_id__in=group_ids,
        updated_at__gte=start,
        updated_at__lte=end,
    ).values_list("assignment__group_id", "value"):
        n = _parse_grade_value(value)
        if n is not None:
            grades_by_group[group_id].append(n)

    teachers_map: dict[int, list[str]] = defaultdict(list)
    for group_id, name in (
        TeachingAssignment.objects.filter(group_id__in=group_ids, is_active=True)
        .values_list("group_id", "teacher__full_name")
        .distinct()
    ):
        if name:
            teachers_map[group_id].append(name)

    result = []
    for g in groups:
        gid = g["id"]
        nums = grades_by_group.get(gid, [])
        result.append(
            {
                "id": gid,
                "name": g["name"],
                "student_count": enrollment_counts.get(gid, 0),
                "grades_count": grade_counts.get(gid, 0),
                "average": _avg(nums),
                "teachers": teachers_map.get(gid, []),
            }
        )
    return result


def _group_detail(group: Group, start: datetime, end: datetime) -> dict:
    grades_qs = Grade.objects.filter(
        assignment__group=group, updated_at__gte=start, updated_at__lte=end
    ).select_related("assignment__subject", "assignment__teacher")
    by_subject: dict[str, list[float]] = defaultdict(list)
    for g in grades_qs:
        n = _parse_grade_value(g.value)
        if n is not None:
            by_subject[g.assignment.subject.name].append(n)
    subjects = [
        {"name": name, "average": _avg(vals), "grades_count": len(vals)}
        for name, vals in sorted(by_subject.items())
    ]
    teacher_counts: dict[str, int] = defaultdict(int)
    for g in grades_qs:
        teacher_counts[g.assignment.teacher.full_name] += 1
    teachers_activity = [
        {"name": k, "grades_count": v} for k, v in sorted(teacher_counts.items(), key=lambda x: -x[1])
    ]
    return {
        "id": group.id,
        "name": group.name,
        "grades_series": _grade_series(start, end, "week"),
        "subjects": subjects,
        "teachers_activity": teachers_activity,
    }


class AdminAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]

    def get(self, request):
        start, end, prev_start, prev_end, period_key = _resolve_period(request)
        now = timezone.now()
        today_start = timezone.make_aware(datetime.combine(timezone.localdate(), datetime.min.time()))
        week_ago = now - timedelta(days=7)

        accounts_total = AppAccount.objects.count()
        students_total = Student.objects.filter(is_active=True).count()
        teachers_total = Teacher.objects.filter(is_active=True).count()
        groups_total = Group.objects.filter(is_active=True).count()

        reg_today = AppAccount.objects.filter(created_at__gte=today_start).count()
        reg_week = AppAccount.objects.filter(created_at__gte=week_ago).count()
        reg_month = AppAccount.objects.filter(created_at__gte=now - timedelta(days=30)).count()

        cur_grades = _grade_stats(start, end)
        prev_grades = _grade_stats(prev_start, prev_end)

        today_grades = Grade.objects.filter(updated_at__gte=today_start).count()
        today_logins = _active_users(today_start)

        recent = (
            Grade.objects.filter(updated_at__gte=today_start)
            .select_related("student", "assignment__teacher", "assignment__subject", "assignment__group")
            .order_by("-updated_at")[:40]
        )
        recent_feed = [
            {
                "at": g.updated_at.isoformat(),
                "teacher": g.assignment.teacher.full_name,
                "student": g.student.full_name,
                "value": g.value,
                "subject": g.assignment.subject.name,
                "group": g.assignment.group.name,
            }
            for g in recent
        ]

        top_groups = (
            Grade.objects.filter(updated_at__gte=today_start)
            .values("assignment__group__id", "assignment__group__name")
            .annotate(c=Count("id"))
            .order_by("-c")[:5]
        )
        top_teachers = (
            Grade.objects.filter(updated_at__gte=today_start)
            .values("assignment__teacher__id", "assignment__teacher__full_name")
            .annotate(c=Count("id"))
            .order_by("-c")[:5]
        )

        group_id = request.query_params.get("group_id")
        group_detail = None
        if group_id:
            try:
                g = Group.objects.get(pk=int(group_id))
                group_detail = _group_detail(g, start, end)
            except (Group.DoesNotExist, ValueError, TypeError):
                pass

        return Response(
            {
                "period": {
                    "key": period_key,
                    "from": start.isoformat(),
                    "to": end.isoformat(),
                },
                "users": {
                    "total": accounts_total,
                    "students": students_total,
                    "teachers": teachers_total,
                    "registrations_today": reg_today,
                    "registrations_week": reg_week,
                    "registrations_month": reg_month,
                    "active_today": _active_users(today_start),
                    "active_week": _active_users(week_ago),
                },
                "groups_count": groups_total,
                "grades": {
                    **cur_grades,
                    "count_prev": prev_grades["count"],
                    "average_prev": prev_grades["average"],
                    "count_delta_pct": _pct_delta(cur_grades["count"], prev_grades["count"]),
                    "average_delta_pct": _pct_delta(cur_grades["average"] or 0, prev_grades["average"] or 0)
                    if cur_grades["average"] is not None and prev_grades["average"] is not None
                    else None,
                    "series": _grade_series(start, end, period_key),
                },
                "registrations_series": _registration_series(start, end),
                "today": {
                    "grades_count": today_grades,
                    "logins_count": today_logins,
                    "top_groups": [
                        {"id": r["assignment__group__id"], "name": r["assignment__group__name"], "grades_count": r["c"]}
                        for r in top_groups
                    ],
                    "top_teachers": [
                        {
                            "id": r["assignment__teacher__id"],
                            "name": r["assignment__teacher__full_name"],
                            "grades_count": r["c"],
                        }
                        for r in top_teachers
                    ],
                    "recent_grades": recent_feed,
                },
                "groups": _groups_table(start, end),
                "group_detail": group_detail,
            }
        )
