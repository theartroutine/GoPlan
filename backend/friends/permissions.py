from rest_framework.permissions import BasePermission


class IsProfileCompleted(BasePermission):
    message = "Complete verification and profile setup to use this feature."

    def has_permission(self, request, view):
        user = request.user
        if not user or user.is_anonymous:
            return False
        return user.email_verified and user.is_profile_completed
