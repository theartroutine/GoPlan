from __future__ import annotations

from rest_framework.permissions import BasePermission


class IsProfileCompleted(BasePermission):
    """User must have a verified email and a completed profile.

    Lives in ``accounts`` because it reads ``User`` fields only. Every app that
    gates a feature behind profile completion imports it from here.
    """

    message = "Complete verification and profile setup to use this feature."

    def has_permission(self, request, view):
        user = request.user
        if not user or user.is_anonymous:
            return False
        return user.email_verified and user.is_profile_completed
