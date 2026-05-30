from __future__ import annotations

from urllib.parse import quote

from rest_framework import serializers

from accounts.services import resolve_avatar_url
from memories.memory_video_services import (
    build_memory_share_url,
    get_memory_music_track,
)
from memories.models import (
    TripMemoryVideo,
    TripMemoryVideoSourceMode,
    TripMemoryVideoStatus,
    TripPhoto,
)
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


class TripMemoryVideoCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    source_mode = serializers.ChoiceField(choices=TripMemoryVideoSourceMode.choices)
    photo_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
        default=list,
    )
    music_key = serializers.CharField(max_length=80)


class TripMemoryVideoUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120, allow_blank=True)


class TripMemoryVideoSerializer(serializers.ModelSerializer):
    trip_id = serializers.UUIDField(read_only=True)
    music = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()
    can_download = serializers.SerializerMethodField()
    share = serializers.SerializerMethodField()
    render_error = serializers.SerializerMethodField()

    class Meta:
        model = TripMemoryVideo
        fields = [
            "id",
            "trip_id",
            "title",
            "status",
            "source_mode",
            "source_photo_count",
            "music",
            "duration_seconds",
            "created_by",
            "can_manage",
            "can_download",
            "share",
            "render_error",
            "created_at",
            "updated_at",
        ]

    def get_music(self, obj: TripMemoryVideo) -> dict:
        track = get_memory_music_track(obj.music_key)
        if track is None:
            return {
                "key": obj.music_key,
                "title": "",
                "artist": "",
                "license": "",
                "license_url": "",
                "source_url": "",
            }
        return {
            "key": track.key,
            "title": track.title,
            "artist": track.artist,
            "license": track.license,
            "license_url": track.license_url,
            "source_url": track.source_url,
        }

    def get_created_by(self, obj: TripMemoryVideo) -> dict:
        if obj.created_by_id and obj.created_by is not None:
            return {
                "id": str(obj.created_by.id),
                "display_name": obj.created_by.display_name,
            }
        return {
            "id": None,
            "display_name": obj.created_by_display_name_snapshot,
        }

    def get_can_manage(self, obj: TripMemoryVideo) -> bool:
        actor = self.context.get("actor")
        membership = self.context.get("membership")
        if actor is None or membership is None:
            return False
        return obj.created_by_id == actor.id or membership.role == TripRole.CAPTAIN

    def get_can_download(self, obj: TripMemoryVideo) -> bool:
        return (
            obj.status == TripMemoryVideoStatus.READY
            and self.context.get("membership") is not None
        )

    def get_render_error(self, obj: TripMemoryVideo) -> dict | None:
        if obj.status != TripMemoryVideoStatus.FAILED or not obj.render_error_code:
            return None
        return {
            "code": obj.render_error_code,
            "message": obj.render_error_message,
        }

    def get_share(self, obj: TripMemoryVideo) -> dict:
        public_base_url = self.context.get("public_base_url", "")
        url = None
        if obj.share_enabled:
            url = build_memory_share_url(
                public_base_url=public_base_url,
                slug=obj.share_slug,
            )
        return {
            "enabled": obj.share_enabled,
            "url": url,
        }


class PublicTripMemoryVideoSerializer(serializers.ModelSerializer):
    poster_url = serializers.SerializerMethodField()
    video_url = serializers.SerializerMethodField()
    music = serializers.SerializerMethodField()

    class Meta:
        model = TripMemoryVideo
        fields = [
            "title",
            "poster_url",
            "video_url",
            "duration_seconds",
            "source_photo_count",
            "music",
        ]

    def get_music(self, obj: TripMemoryVideo) -> dict | None:
        # CC-BY obliges us to credit the music to public viewers too. Only
        # expose attribution when the track actually carries a license.
        track = get_memory_music_track(obj.music_key)
        if track is None or not track.license:
            return None
        return {
            "title": track.title,
            "artist": track.artist,
            "license": track.license,
            "license_url": track.license_url,
            "source_url": track.source_url,
        }

    def _asset_url(self, obj: TripMemoryVideo, variant: str) -> str:
        slug = quote(obj.share_slug or "", safe="")
        return f"/api/public/memories/{slug}/{variant}"

    def get_poster_url(self, obj: TripMemoryVideo) -> str:
        return self._asset_url(obj, "poster")

    def get_video_url(self, obj: TripMemoryVideo) -> str:
        return self._asset_url(obj, "video")
