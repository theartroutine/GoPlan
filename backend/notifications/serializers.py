from rest_framework import serializers

from notifications.services import build_notification_payload


class NotificationSerializer(serializers.BaseSerializer):
    """Read-only serializer that delegates to the shared payload builder."""

    def to_representation(self, instance):
        return build_notification_payload(instance)
