from __future__ import annotations

from rest_framework import serializers


class SendChatMessageSerializer(serializers.Serializer):
    content = serializers.CharField(
        max_length=2000,
        trim_whitespace=True,
    )
    client_message_id = serializers.UUIDField()


class ChatMessageListQuerySerializer(serializers.Serializer):
    cursor = serializers.CharField(required=False)
    since = serializers.UUIDField(required=False)
    limit = serializers.IntegerField(required=False)

    def validate(self, attrs):
        if "cursor" in attrs and "since" in attrs:
            raise serializers.ValidationError(
                {"detail": "cursor and since are mutually exclusive."}
            )

        limit = attrs.get("limit")
        if limit is None:
            return attrs

        if limit < 1:
            raise serializers.ValidationError({"limit": "Limit must be at least 1."})

        max_limit = 200 if "since" in attrs else 100
        if limit > max_limit:
            raise serializers.ValidationError(
                {"limit": f"Limit must be less than or equal to {max_limit}."}
            )
        return attrs
