import re

from rest_framework import serializers


IDENTIFY_NAME_PATTERN = re.compile(r"^[a-z]{3,24}$")
IDENTIFY_CODE_PATTERN = re.compile(r"^[A-Z0-9]{6}$")


# -------- Helpers --------


def _build_friend_user_payload(user):
    """Minimal user representation for friend system responses."""
    return {
        "id": str(user.id),
        "display_name": user.display_name,
        "identify_tag": user.identify_tag,
    }


# -------- Input Serializers --------


class SendFriendRequestSerializer(serializers.Serializer):
    identify_tag = serializers.CharField(required=True, max_length=31)

    def validate_identify_tag(self, value):
        stripped = value.strip()
        parts = stripped.split("#")
        if len(parts) != 2:
            raise serializers.ValidationError(
                "Invalid format. Use name#CODE (e.g. johndoe#ABC123)."
            )

        name = parts[0].strip().lower()
        code = parts[1].strip().upper()

        if not IDENTIFY_NAME_PATTERN.fullmatch(name):
            raise serializers.ValidationError(
                "Name part must be 3-24 lowercase letters."
            )

        if not IDENTIFY_CODE_PATTERN.fullmatch(code):
            raise serializers.ValidationError(
                "Code part must be exactly 6 uppercase alphanumeric characters."
            )

        return f"{name}#{code}"


# -------- Output Serializers --------


class FriendRequestSerializer(serializers.Serializer):
    """Read-only serializer for FriendRequest responses."""

    def to_representation(self, instance):
        return {
            "id": str(instance.id),
            "sender": _build_friend_user_payload(instance.sender),
            "receiver": _build_friend_user_payload(instance.receiver),
            "status": instance.status,
            "resolved_at": (
                instance.resolved_at.isoformat()
                if instance.resolved_at
                else None
            ),
            "created_at": instance.created_at.isoformat(),
        }


class FriendSerializer(serializers.Serializer):
    """Read-only serializer for Friendship responses.

    Requires context={"request_user": user} to determine the other user.
    """

    def to_representation(self, instance):
        request_user = self.context["request_user"]
        if instance.user_low == request_user:
            other = instance.user_high
        else:
            other = instance.user_low

        return {
            "friendship_id": str(instance.id),
            "user": _build_friend_user_payload(other),
            "created_at": instance.created_at.isoformat(),
        }
