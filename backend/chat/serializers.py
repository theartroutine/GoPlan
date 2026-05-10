from __future__ import annotations

from rest_framework import serializers

from chat.models import ALLOWED_REACTION_EMOJIS


class SendChatMessageSerializer(serializers.Serializer):
    content = serializers.CharField(
        max_length=2000,
        trim_whitespace=True,
    )
    client_message_id = serializers.UUIDField()


class AddReactionSerializer(serializers.Serializer):
    emoji = serializers.CharField(max_length=8)

    def validate_emoji(self, value):
        if value not in ALLOWED_REACTION_EMOJIS:
            raise serializers.ValidationError("Unsupported emoji.")
        return value


class DeleteChatMessageSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=("for_me", "for_everyone"))


class BulkHideChatMessagesSerializer(serializers.Serializer):
    message_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
        max_length=100,
    )


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
