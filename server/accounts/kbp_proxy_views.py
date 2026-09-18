from __future__ import annotations

import logging
import os
import socket
import struct
import time
from urllib.parse import urljoin, urlparse, urlunparse

import requests
import urllib3
import urllib3.util.connection as urllib3_connection
from requests.adapters import HTTPAdapter
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from kbp_server.throttling import KbpProxyAnonRateThrottle

logger = logging.getLogger(__name__)

TIMEOUT_SEC = 30
MAX_REDIRECTS = 5
MAX_ATTEMPTS = 3
DNS_CACHE_TTL_SEC = 300
_REDIRECT_STATUSES = {301, 302, 303, 307, 308}
DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_BLOCKED_REQUEST_HEADERS = {
    "host",
    "content-length",
    "authorization",
    "cookie",
    "cookie2",
    "proxy-authorization",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-real-ip",
    "connection",
    "transfer-encoding",
}
_BLOCKED_RESPONSE_HEADERS = {
    "set-cookie",
    "set-cookie2",
    "transfer-encoding",
    "connection",
    "www-authenticate",
}

# kbp.by publishes AAAA, but many hosts (incl. this app's egress) have broken IPv6.
# Match lib/server/kbpUpstream.ts: prefer IPv4 so requests do not die on AF_INET6.
urllib3_connection.allowed_gai_family = lambda: socket.AF_INET

_dns_cache: dict[str, tuple[str, float]] = {}


class _SniHostnameAdapter(HTTPAdapter):
    """HTTPS to a literal IP while presenting the real hostname for SNI/cert."""

    def __init__(self, server_hostname: str, **kwargs):
        self._server_hostname = server_hostname
        super().__init__(**kwargs)

    def init_poolmanager(self, connections, maxsize, block=False, **pool_kwargs):
        pool_kwargs["server_hostname"] = self._server_hostname
        pool_kwargs["assert_hostname"] = self._server_hostname
        self.poolmanager = urllib3.PoolManager(
            num_pools=connections,
            maxsize=maxsize,
            block=block,
            **pool_kwargs,
        )


def _is_allowed_kbp_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme != "https":
        return False
    if (parsed.hostname or "").lower() != "kbp.by":
        return False
    if parsed.username or parsed.password:
        return False
    if parsed.port not in (None, 443):
        return False
    return True


def _is_retryable_upstream_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    retry_tokens = (
        "timeout",
        "timed out",
        "etimedout",
        "econnreset",
        "econnrefused",
        "network is unreachable",
        "temporary failure",
        "name or service not known",
        "nodename nor servname",
        "connection aborted",
        "connection reset",
        "broken pipe",
        "ssl",
        "max retries",
        "failed to resolve",
        "name resolution",
    )
    return any(token in msg for token in retry_tokens)


def _dns_servers() -> list[str]:
    raw = (os.environ.get("KBP_DNS_SERVERS") or os.environ.get("DOCKER_DNS") or "").strip()
    servers: list[str] = []
    if raw:
        servers.extend(part.strip() for part in raw.replace(";", ",").split(",") if part.strip())
    # Prefer host/gateway resolvers that work when public DNS is filtered from Docker.
    for candidate in ("10.122.125.226", "8.8.8.8", "1.1.1.1"):
        if candidate not in servers:
            servers.append(candidate)
    return servers


def _udp_dns_a(hostname: str, server: str, timeout: float = 2.5) -> str | None:
    """Minimal DNS A lookup. Returns IPv4 string or None."""
    labels = hostname.strip(".").encode("ascii").split(b".")
    question = b"".join(bytes([len(label)]) + label for label in labels) + b"\x00\x00\x01\x00\x01"
    packet = b"\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00" + question
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        sock.sendto(packet, (server, 53))
        data, _ = sock.recvfrom(512)
    except OSError:
        return None
    finally:
        sock.close()

    if len(data) < 12:
        return None
    flags = struct.unpack("!H", data[2:4])[0]
    if flags & 0x000F:  # RCODE != NOERROR
        return None
    ancount = struct.unpack("!H", data[6:8])[0]
    if ancount < 1:
        return None

    offset = 12
    # skip question
    while offset < len(data) and data[offset] != 0:
        offset += 1 + data[offset]
    offset += 5  # null + type + class
    if offset > len(data):
        return None

    for _ in range(ancount):
        if offset >= len(data):
            return None
        # name (pointer or labels)
        if data[offset] & 0xC0 == 0xC0:
            offset += 2
        else:
            while offset < len(data) and data[offset] != 0:
                offset += 1 + data[offset]
            offset += 1
        if offset + 10 > len(data):
            return None
        rtype, _rclass, _ttl, rdlength = struct.unpack("!HHIH", data[offset : offset + 10])
        offset += 10
        if offset + rdlength > len(data):
            return None
        rdata = data[offset : offset + rdlength]
        offset += rdlength
        if rtype == 1 and rdlength == 4:
            return socket.inet_ntoa(rdata)
    return None


def _resolve_kbp_ipv4() -> str:
    cached = _dns_cache.get("kbp.by")
    if cached and cached[1] > time.time():
        return cached[0]

    try:
        infos = socket.getaddrinfo("kbp.by", 443, socket.AF_INET, socket.SOCK_STREAM)
        if infos:
            ip = infos[0][4][0]
            _dns_cache["kbp.by"] = (ip, time.time() + DNS_CACHE_TTL_SEC)
            return ip
    except OSError as exc:
        logger.warning("system DNS failed for kbp.by: %s", exc)

    for server in _dns_servers():
        ip = _udp_dns_a("kbp.by", server)
        if ip:
            logger.info("resolved kbp.by via DNS %s -> %s", server, ip)
            _dns_cache["kbp.by"] = (ip, time.time() + DNS_CACHE_TTL_SEC)
            return ip

    raise requests.RequestException("failed to resolve kbp.by (system DNS and UDP fallbacks)")


def _rewrite_url_to_ip(url: str, ip: str) -> str:
    parsed = urlparse(url)
    netloc = ip
    if parsed.port and parsed.port != 443:
        netloc = f"{ip}:{parsed.port}"
    return urlunparse(parsed._replace(netloc=netloc))


def _request_kbp_once(method: str, url: str, headers: dict, data):
    """GET/POST к kbp.by с ручным follow redirect только на тот же хост."""
    current_url = url
    current_method = method
    current_data = data if method == "POST" else None
    ip = _resolve_kbp_ipv4()
    session = requests.Session()
    session.mount("https://", _SniHostnameAdapter("kbp.by"))

    for _ in range(MAX_REDIRECTS + 1):
        if not _is_allowed_kbp_url(current_url):
            raise ValueError("redirect_url_not_allowed")
        request_headers = {**headers, "Host": "kbp.by"}
        upstream = session.request(
            current_method,
            _rewrite_url_to_ip(current_url, ip),
            headers=request_headers,
            data=current_data,
            timeout=TIMEOUT_SEC,
            allow_redirects=False,
        )
        if upstream.status_code not in _REDIRECT_STATUSES:
            return upstream
        location = upstream.headers.get("Location")
        if not location:
            return upstream
        next_url = urljoin(current_url, location)
        if not _is_allowed_kbp_url(next_url):
            raise ValueError("redirect_url_not_allowed")
        current_url = next_url
        if upstream.status_code in {301, 302, 303} and current_method == "POST":
            current_method = "GET"
            current_data = None

    raise requests.RequestException("too_many_redirects")


def _request_kbp(method: str, url: str, headers: dict, data):
    last_error: BaseException | None = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            return _request_kbp_once(method, url, headers, data)
        except requests.RequestException as exc:
            last_error = exc
            # Drop DNS cache on resolution/connect failures so the next try re-resolves.
            _dns_cache.pop("kbp.by", None)
            if attempt >= MAX_ATTEMPTS - 1 or not _is_retryable_upstream_error(exc):
                break
            sleep_s = 0.4 * (attempt + 1)
            logger.warning(
                "kbp proxy attempt %s/%s failed (%s); retry in %.1fs",
                attempt + 1,
                MAX_ATTEMPTS,
                exc,
                sleep_s,
            )
            time.sleep(sleep_s)
    assert last_error is not None
    raise last_error


class KbpProxyView(APIView):
    """Прокси HTTP к kbp.by для веб-клиента (обход CORS). На Android — прямой запрос."""

    permission_classes = [AllowAny]
    throttle_classes = [KbpProxyAnonRateThrottle]

    def post(self, request):
        url = request.data.get("url")
        method = str(request.data.get("method") or "GET").upper()
        headers_in = request.data.get("headers") or {}
        data = request.data.get("data")

        if not url or not isinstance(url, str):
            return Response({"detail": "url обязателен"}, status=status.HTTP_400_BAD_REQUEST)
        if not _is_allowed_kbp_url(url):
            return Response({"detail": "URL не разрешён (только kbp.by)"}, status=status.HTTP_400_BAD_REQUEST)
        if method not in {"GET", "POST"}:
            return Response({"detail": "method должен быть GET или POST"}, status=status.HTTP_400_BAD_REQUEST)

        forward_headers = {
            "User-Agent": DEFAULT_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://kbp.by/",
        }
        if isinstance(headers_in, dict):
            for key, value in headers_in.items():
                if not isinstance(key, str) or not isinstance(value, str):
                    continue
                if key.lower() in _BLOCKED_REQUEST_HEADERS:
                    continue
                forward_headers[key] = value

        try:
            upstream = _request_kbp(method, url, forward_headers, data)
        except ValueError:
            return Response(
                {"detail": "URL не разрешён (только kbp.by)"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except requests.RequestException as exc:
            logger.warning("kbp proxy upstream error for %s: %s", url, exc)
            return Response(
                {"detail": "Ошибка upstream"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        out_headers = {
            k: v
            for k, v in upstream.headers.items()
            if k.lower() not in _BLOCKED_RESPONSE_HEADERS
        }
        return Response(
            {
                "status": upstream.status_code,
                "headers": out_headers,
                "data": upstream.text,
            }
        )
