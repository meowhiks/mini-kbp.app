"""Rate limits for auth and sensitive admin endpoints."""

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class AuthAnonRateThrottle(AnonRateThrottle):
    scope = "auth"


class RestoreUserRateThrottle(UserRateThrottle):
    scope = "restore"


class KbpProxyAnonRateThrottle(AnonRateThrottle):
    scope = "kbp_proxy"
