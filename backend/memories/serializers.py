from __future__ import annotations

from rest_framework import serializers

from accounts.services import resolve_avatar_url
from memories.models import TripPhoto
from trips.models import TripRole


class TripPhotoUploadSerializer(serializers.Serializer):
    files = serializers.ListField(
        child=serializers.FileField(),
        allow_empty=True,
    )


class TripPhotoSerializer(serializers.ModelSerializer):
    uploaded_by = serializers.SerializerMethodField()
    width = serializers.IntegerField(source="original_width")
    height = serializers.IntegerField(source="original_height")
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = TripPhoto
        fields = [
            "id",
            "created_at",
            "uploaded_by",
            "width",
            "height",
            "thumbnail_width",
            "thumbnail_height",
            "medium_width",
            "medium_height",
            "can_delete",
        ]

    def get_uploaded_by(self, obj: TripPhoto) -> dict:
        if obj.uploaded_by_id and obj.uploaded_by is not None:
            return {
                "id": str(obj.uploaded_by.id),
                "display_name": obj.uploaded_by.display_name,
                "identify_tag": obj.uploaded_by.identify_tag,
                "avatar_url": resolve_avatar_url(obj.uploaded_by),
            }
        return {
            "id": None,
            "display_name": obj.uploaded_by_display_name_snapshot,
            "identify_tag": obj.uploaded_by_identify_tag_snapshot,
            "avatar_url": None,
        }

    def get_can_delete(self, obj: TripPhoto) -> bool:
        actor = self.context.get("actor")
        membership = self.context.get("membership")
        if actor is None or membership is None:
            return False
        return obj.uploaded_by_id == actor.id or membership.role == TripRole.CAPTAIN
