from rest_framework import serializers

from notifications.services import build_notification_payload


class NotificationSerializer(serializers.BaseSerializer):
    """Read-only serializer that delegates to the shared payload builder."""

    def to_representation(self, instance):
        invitation_statuses = self.context.get("invitation_statuses", {})
        return build_notification_payload(
            instance,
            invitation_status=invitation_statuses.get(instance.id),
        )
