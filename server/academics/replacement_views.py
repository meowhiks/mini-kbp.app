"""API сканов замен расписания."""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsStaffUser
from academics.replacement_match import apply_catalog_match
from academics.replacement_ocr import normalize_ocr_replacements
from academics.replacement_vision import run_vision_ocr, vision_configured
from academics.replacements import ReplacementEntry, ReplacementScanBatch


def _entry_to_dict(e: ReplacementEntry) -> dict[str, Any]:
    return {
        "id": e.id,
        "group_code": e.group_code,
        "kbp_group_id": e.kbp_group_id,
        "kbp_group_kbp_id": e.kbp_group.kbp_id if e.kbp_group_id else None,
        "lesson_number": e.lesson_number,
        "event_type": e.event_type,
        "replacement_data": e.replacement_data or {},
        "original_data": e.original_data or {},
        "kbp_subject_id": e.kbp_subject_id,
        "kbp_teacher_id": e.kbp_teacher_id,
        "kbp_place_id": e.kbp_place_id,
        "sort_order": e.sort_order,
    }


def _batch_to_dict(batch: ReplacementScanBatch, *, include_entries: bool = True) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": batch.id,
        "date": batch.date.isoformat() if batch.date else None,
        "day_of_week": batch.day_of_week or "",
        "signed_by": batch.signed_by or "",
        "status": batch.status,
        "created_by_id": batch.created_by_id,
        "ocr_meta": batch.ocr_meta or {},
        "published_at": batch.published_at.isoformat() if batch.published_at else None,
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
        "updated_at": batch.updated_at.isoformat() if batch.updated_at else None,
    }
    if include_entries:
        entries = list(batch.entries.select_related("kbp_group").order_by("sort_order", "id"))
        data["entries"] = [_entry_to_dict(e) for e in entries]
        data["schedule_info"] = {
            "day_of_week": batch.day_of_week or None,
            "date": batch.date.isoformat() if batch.date else None,
            "signed_by": batch.signed_by or None,
        }
        data["replacements"] = [
            {
                "group_code": e.group_code,
                "lesson_number": e.lesson_number,
                "event_type": e.event_type,
                "replacement_data": e.replacement_data or {},
                "original_data": e.original_data or {},
            }
            for e in entries
        ]
    return data


def _parse_date(value: Any) -> dt.date | None:
    if value is None or value == "":
        return None
    if isinstance(value, dt.date) and not isinstance(value, dt.datetime):
        return value
    s = str(value).strip()
    try:
        return dt.date.fromisoformat(s[:10])
    except ValueError:
        return None


def _create_entries_from_normalized(batch: ReplacementScanBatch, normalized: dict[str, Any]) -> None:
    rows = normalized.get("replacements") or []
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        matched = apply_catalog_match(row)
        ReplacementEntry.objects.create(
            batch=batch,
            group_code=str(matched.get("group_code") or "").strip()[:64],
            kbp_group=matched.get("kbp_group"),
            lesson_number=int(matched.get("lesson_number") or 0),
            event_type=str(matched.get("event_type") or ReplacementEntry.EventType.REPLACEMENT),
            replacement_data=matched.get("replacement_data") or {},
            original_data=matched.get("original_data") or {},
            kbp_subject=matched.get("kbp_subject"),
            kbp_teacher=matched.get("kbp_teacher"),
            kbp_place=matched.get("kbp_place"),
            sort_order=i,
        )


def _require_staff(request) -> Response | None:
    if not IsStaffUser().has_permission(request, None):
        return Response({"detail": "Нет прав"}, status=status.HTTP_403_FORBIDDEN)
    return None


def _draft_batch_from_normalized(
    *,
    user,
    normalized: dict[str, Any],
    ocr_meta: dict[str, Any] | None = None,
) -> ReplacementScanBatch:
    info = normalized.get("schedule_info") or {}
    date_val = _parse_date(info.get("date"))
    with transaction.atomic():
        batch = ReplacementScanBatch.objects.create(
            date=date_val,
            day_of_week=str(info.get("day_of_week") or "")[:32],
            signed_by=str(info.get("signed_by") or "")[:255],
            status=ReplacementScanBatch.Status.DRAFT,
            created_by=user,
            ocr_meta=ocr_meta or {},
        )
        _create_entries_from_normalized(batch, normalized)
    return batch


class ReplacementImportView(APIView):
    """POST /v0/replacements/import/ — JSON от внешнего ИИ → draft (без vision key)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        denied = _require_staff(request)
        if denied:
            return denied

        body = request.data if isinstance(request.data, dict) else {}
        # Allow wrapping: { "payload": {...} } or raw schedule JSON
        payload = body.get("payload") if isinstance(body.get("payload"), dict) else body
        if not isinstance(payload, dict):
            return Response({"detail": "Ожидается JSON-объект"}, status=400)
        if not payload.get("replacements") and not payload.get("rows"):
            return Response(
                {"detail": "В JSON нет replacements[]"},
                status=400,
            )

        normalized = normalize_ocr_replacements(payload)
        if not (normalized.get("replacements") or []):
            return Response(
                {"detail": "После нормализации нет строк замен"},
                status=400,
            )

        batch = _draft_batch_from_normalized(
            user=request.user,
            normalized=normalized,
            ocr_meta={"source": "external_ai_import"},
        )
        return Response(_batch_to_dict(batch), status=status.HTTP_201_CREATED)


class ReplacementScanView(APIView):
    """POST /v0/replacements/scan/ — multipart images → draft batch."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        denied = _require_staff(request)
        if denied:
            return denied
        if not vision_configured():
            return Response(
                {"detail": "OCR не настроен (REPLACEMENT_VISION_API_KEY)"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        files = request.FILES.getlist("images") or request.FILES.getlist("image")
        if not files and "file" in request.FILES:
            files = [request.FILES["file"]]
        if not files:
            return Response({"detail": "Нужно хотя бы одно фото"}, status=status.HTTP_400_BAD_REQUEST)

        merged_rows: list[dict[str, Any]] = []
        schedule_info: dict[str, Any] = {}
        errors: list[str] = []

        for f in files:
            raw = f.read()
            ctype = getattr(f, "content_type", None) or "image/jpeg"
            try:
                ocr_raw = run_vision_ocr(raw, content_type=ctype)
            except Exception as exc:
                errors.append(str(exc))
                continue
            normalized = normalize_ocr_replacements(ocr_raw)
            info = normalized.get("schedule_info") or {}
            if info.get("date") and not schedule_info.get("date"):
                schedule_info = info
            elif not schedule_info:
                schedule_info = info
            merged_rows.extend(normalized.get("replacements") or [])

        if not merged_rows and errors:
            return Response(
                {"detail": "OCR не удался", "errors": errors},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        normalized_all = normalize_ocr_replacements(
            {"schedule_info": schedule_info, "replacements": merged_rows}
        )
        if merged_rows and all(isinstance(r, dict) and r.get("event_type") for r in merged_rows):
            normalized_all = {"schedule_info": schedule_info, "replacements": merged_rows}

        batch = _draft_batch_from_normalized(
            user=request.user,
            normalized=normalized_all,
            ocr_meta={"errors": errors, "image_count": len(files)},
        )
        return Response(_batch_to_dict(batch), status=status.HTTP_201_CREATED)


class ReplacementBatchListView(APIView):
    """GET /v0/replacements/ — список пакетов (staff)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _require_staff(request)
        if denied:
            return denied
        qs = ReplacementScanBatch.objects.all().order_by("-created_at")[:100]
        return Response([_batch_to_dict(b, include_entries=False) for b in qs])


class ReplacementBatchDetailView(APIView):
    """GET/PATCH /v0/replacements/{id}/"""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk: int):
        denied = _require_staff(request)
        if denied:
            return denied
        batch = ReplacementScanBatch.objects.filter(pk=pk).first()
        if not batch:
            return Response({"detail": "Не найдено"}, status=404)
        return Response(_batch_to_dict(batch))

    def patch(self, request, pk: int):
        denied = _require_staff(request)
        if denied:
            return denied
        batch = ReplacementScanBatch.objects.filter(pk=pk).first()
        if not batch:
            return Response({"detail": "Не найдено"}, status=404)
        if batch.status == ReplacementScanBatch.Status.PUBLISHED:
            return Response({"detail": "Опубликованный пакет нельзя менять"}, status=400)

        body = request.data if isinstance(request.data, dict) else {}
        if "date" in body:
            batch.date = _parse_date(body.get("date"))
        if "day_of_week" in body:
            batch.day_of_week = str(body.get("day_of_week") or "")[:32]
        if "signed_by" in body:
            batch.signed_by = str(body.get("signed_by") or "")[:255]

        entries_in = body.get("entries") or body.get("replacements")
        with transaction.atomic():
            batch.save()
            if isinstance(entries_in, list):
                batch.entries.all().delete()
                normalized = normalize_ocr_replacements(
                    {
                        "schedule_info": {
                            "date": batch.date.isoformat() if batch.date else None,
                            "day_of_week": batch.day_of_week,
                            "signed_by": batch.signed_by,
                        },
                        "replacements": entries_in,
                    }
                )
                # If client already sent event_type, prefer merging fields without reclassifying badly
                # Use normalize for √ carry; then overwrite event_type if provided
                for i, raw in enumerate(entries_in):
                    if not isinstance(raw, dict):
                        continue
                    # Prefer already-normalized list if same length
                    row = (normalized.get("replacements") or [None])[i] if i < len(
                        normalized.get("replacements") or []
                    ) else None
                    if not row:
                        row = raw
                    if raw.get("event_type"):
                        row = {**row, "event_type": raw["event_type"]}
                    if "replacement_data" in raw and raw.get("event_type"):
                        # Manual edit: trust client blocks when event_type set
                        row = {
                            "group_code": raw.get("group_code") or row.get("group_code"),
                            "lesson_number": raw.get("lesson_number") or row.get("lesson_number"),
                            "event_type": raw["event_type"],
                            "replacement_data": raw.get("replacement_data") or row.get("replacement_data"),
                            "original_data": raw.get("original_data") or row.get("original_data"),
                        }
                    matched = apply_catalog_match(row)
                    ReplacementEntry.objects.create(
                        batch=batch,
                        group_code=str(matched.get("group_code") or "").strip()[:64],
                        kbp_group=matched.get("kbp_group"),
                        lesson_number=int(matched.get("lesson_number") or 0),
                        event_type=str(matched.get("event_type") or ReplacementEntry.EventType.REPLACEMENT),
                        replacement_data=matched.get("replacement_data") or {},
                        original_data=matched.get("original_data") or {},
                        kbp_subject=matched.get("kbp_subject"),
                        kbp_teacher=matched.get("kbp_teacher"),
                        kbp_place=matched.get("kbp_place"),
                        sort_order=i,
                    )

        return Response(_batch_to_dict(batch))


class ReplacementPublishView(APIView):
    """POST /v0/replacements/{id}/publish/"""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        denied = _require_staff(request)
        if denied:
            return denied
        batch = ReplacementScanBatch.objects.filter(pk=pk).prefetch_related("entries").first()
        if not batch:
            return Response({"detail": "Не найдено"}, status=404)
        if not batch.date:
            return Response({"detail": "Укажите дату пакета"}, status=400)
        if batch.status == ReplacementScanBatch.Status.PUBLISHED:
            return Response(_batch_to_dict(batch))

        batch.status = ReplacementScanBatch.Status.PUBLISHED
        batch.published_at = timezone.now()
        batch.save(update_fields=["status", "published_at", "updated_at"])

        try:
            from academics.replacement_push import notify_replacements_published

            notify_replacements_published(batch)
        except Exception:
            pass

        return Response(_batch_to_dict(batch))


class ReplacementUnpublishView(APIView):
    """POST /v0/replacements/{id}/unpublish/ — снять с публикации (снова draft)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        denied = _require_staff(request)
        if denied:
            return denied
        batch = ReplacementScanBatch.objects.filter(pk=pk).first()
        if not batch:
            return Response({"detail": "Не найдено"}, status=404)
        if batch.status != ReplacementScanBatch.Status.PUBLISHED:
            return Response(_batch_to_dict(batch))

        batch.status = ReplacementScanBatch.Status.DRAFT
        batch.published_at = None
        batch.save(update_fields=["status", "published_at", "updated_at"])
        return Response(_batch_to_dict(batch))


class ReplacementOverlayView(APIView):
    """GET /v0/replacements/overlay/?from=&to= — для app-сессии."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        date_from = _parse_date(request.query_params.get("from"))
        date_to = _parse_date(request.query_params.get("to"))
        if not date_from:
            date_from = timezone.localdate()
        if not date_to:
            date_to = date_from + dt.timedelta(days=14)

        batches = (
            ReplacementScanBatch.objects.filter(
                status=ReplacementScanBatch.Status.PUBLISHED,
                date__gte=date_from,
                date__lte=date_to,
            )
            .prefetch_related("entries__kbp_group")
            .order_by("date", "id")
        )

        days: dict[str, list[dict[str, Any]]] = {}
        for batch in batches:
            key = batch.date.isoformat() if batch.date else ""
            if not key:
                continue
            bucket = days.setdefault(key, [])
            for e in batch.entries.all():
                bucket.append(
                    {
                        "id": e.id,
                        "batch_id": batch.id,
                        "date": key,
                        "group_code": e.group_code,
                        "kbp_group_id": e.kbp_group.kbp_id if e.kbp_group_id else None,
                        "lesson_number": e.lesson_number,
                        "event_type": e.event_type,
                        "replacement_data": e.replacement_data or {},
                        "original_data": e.original_data or {},
                    }
                )

        return Response(
            {
                "from": date_from.isoformat(),
                "to": date_to.isoformat(),
                "days": days,
            }
        )
