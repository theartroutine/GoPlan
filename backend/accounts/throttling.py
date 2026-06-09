from __future__ import annotations

import hmac
from ipaddress import ip_address

from django.conf import settings
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, UserRateThrottle


def _normalized_email(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip().casefold()


def _dev_bypass_emails() -> set[str]:
    if not (
        getattr(settings, "DEBUG", False)
        and getattr(settings, "DEV_THROTTLE_BYPASS_ENABLED", False)
    ):
        return set()
    return {
        _normalized_email(email)
        for email in getattr(settings, "DEV_THROTTLE_BYPASS_EMAILS", ())
        if _normalized_email(email)
    }


def should_bypass_dev_throttle(request) -> bool:
    bypass_emails = _dev_bypass_emails()
    if not bypass_emails:
        return False

    user = getattr(request, "user", None)
    if getattr(user, "is_authenticated", False):
        if _normalized_email(getattr(user, "email", "")) in bypass_emails:
            return True

    return False


def _trusted_forwarded_client_ip(request) -> str:
    proxy_secret = getattr(settings, "GOPLAN_INTERNAL_PROXY_SECRET", "")
    if not proxy_secret:
        return ""

    supplied_secret = request.META.get("HTTP_X_GOPLAN_INTERNAL_PROXY_SECRET", "")
    if not hmac.compare_digest(str(supplied_secret), str(proxy_secret)):
        return ""

    raw_client_ip = request.META.get("HTTP_X_GOPLAN_CLIENT_IP", "")
    if not isinstance(raw_client_ip, str):
        return ""

    try:
        return str(ip_address(raw_client_ip.strip()))
    except ValueError:
        return ""


class DevThrottleBypassMixin:
    def get_ident(self, request):
        trusted_client_ip = _trusted_forwarded_client_ip(request)
        if trusted_client_ip:
            return trusted_client_ip
        return super().get_ident(request)

    def allow_request(self, request, view):
        if should_bypass_dev_throttle(request):
            return True
        return super().allow_request(request, view)


class DevBypassAnonRateThrottle(DevThrottleBypassMixin, AnonRateThrottle):
    pass


class DevBypassUserRateThrottle(DevThrottleBypassMixin, UserRateThrottle):
    pass


class DevBypassScopedRateThrottle(DevThrottleBypassMixin, ScopedRateThrottle):
    pass
