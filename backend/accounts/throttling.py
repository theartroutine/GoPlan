from __future__ import annotations

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


class DevThrottleBypassMixin:
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
