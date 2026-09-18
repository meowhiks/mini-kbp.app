"""Экспорт/импорт журналов с gzip-сжатием."""

from __future__ import annotations

import gzip
import json

from django.db import connection, transaction
from django.utils import timezone

from .models import Grade, JournalBackup, JournalDay, LatenessRecord


def export_journal_payload() -> dict:
    grades = list(
        Grade.objects.values(
            "id",
            "assignment_id",
            "student_id",
            "date",
            "slot",
            "value",
            "comment",
        )
    )
    for g in grades:
        if g.get("date"):
            g["date"] = g["date"].isoformat()
    days = list(
        JournalDay.objects.values(
            "id",
            "assignment_id",
            "date",
            "slot",
            "day_type",
            "footer_note",
            "lab_due_date",
            "lab_credited",
            "red_absent",
        )
    )
    for d in days:
        if d.get("date"):
            d["date"] = d["date"].isoformat()
        if d.get("lab_due_date"):
            d["lab_due_date"] = d["lab_due_date"].isoformat()
    lateness = list(
        LatenessRecord.objects.values(
            "id",
            "group_id",
            "student_id",
            "date",
            "slot",
            "minutes",
        )
    )
    for l in lateness:
        if l.get("date"):
            l["date"] = l["date"].isoformat()
    return {
        "v": 1,
        "exported_at": timezone.now().isoformat(),
        "grades": grades,
        "journal_days": days,
        "lateness": lateness,
    }


def compress_payload(payload: dict) -> tuple[bytes, int, int]:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    compressed = gzip.compress(raw, compresslevel=9)
    return compressed, len(raw), len(compressed)


def decompress_payload(blob: bytes) -> dict:
    raw = gzip.decompress(blob)
    return json.loads(raw.decode("utf-8"))


def _reset_pk_sequence(model) -> None:
    """После bulk_create с явными id — синхронизировать sequence (PostgreSQL)."""
    if connection.vendor != "postgresql":
        return
    table = model._meta.db_table
    pk_col = model._meta.pk.column
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT setval(pg_get_serial_sequence(%s, %s), "
            "COALESCE((SELECT MAX(%s) FROM %s), 1))",
            [table, pk_col, pk_col, table],
        )


def create_daily_backup(*, backup_date=None, force: bool = False) -> JournalBackup | None:
    backup_date = backup_date or timezone.localdate()
    if JournalBackup.objects.filter(backup_date=backup_date).exists() and not force:
        return None
    payload = export_journal_payload()
    compressed, raw_len, gz_len = compress_payload(payload)
    stats = {
        "grades": len(payload["grades"]),
        "journal_days": len(payload["journal_days"]),
        "lateness": len(payload["lateness"]),
    }
    obj, _ = JournalBackup.objects.update_or_create(
        backup_date=backup_date,
        defaults={
            "payload_gz": compressed,
            "uncompressed_bytes": raw_len,
            "compressed_bytes": gz_len,
            "stats": stats,
        },
    )
    return obj


@transaction.atomic
def restore_journal_from_payload(payload: dict) -> dict:
    Grade.objects.all().delete()
    JournalDay.objects.all().delete()
    LatenessRecord.objects.all().delete()

    grade_rows = []
    for row in payload.get("grades", []):
        grade_rows.append(
            Grade(
                id=row["id"],
                assignment_id=row["assignment_id"],
                student_id=row["student_id"],
                date=row["date"],
                slot=row.get("slot", 0),
                value=row.get("value") or "",
                comment=row.get("comment") or "",
            )
        )
    if grade_rows:
        Grade.objects.bulk_create(grade_rows)
        _reset_pk_sequence(Grade)

    day_rows = []
    for row in payload.get("journal_days", []):
        day_rows.append(
            JournalDay(
                id=row["id"],
                assignment_id=row["assignment_id"],
                date=row["date"],
                slot=row.get("slot", 0),
                day_type=row.get("day_type") or "normal",
                footer_note=row.get("footer_note") or "",
                lab_due_date=row.get("lab_due_date"),
                lab_credited=bool(row.get("lab_credited")),
                red_absent=bool(row.get("red_absent")),
            )
        )
    if day_rows:
        JournalDay.objects.bulk_create(day_rows)
        _reset_pk_sequence(JournalDay)

    late_rows = []
    for row in payload.get("lateness", []):
        late_rows.append(
            LatenessRecord(
                id=row["id"],
                group_id=row["group_id"],
                student_id=row["student_id"],
                date=row["date"],
                slot=row.get("slot", 0),
                minutes=row.get("minutes") or 0,
            )
        )
    if late_rows:
        LatenessRecord.objects.bulk_create(late_rows)
        _reset_pk_sequence(LatenessRecord)

    return {
        "grades": len(grade_rows),
        "journal_days": len(day_rows),
        "lateness": len(late_rows),
    }
