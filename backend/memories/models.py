from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class TripPhoto(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(
        "trips.Trip",
        on_delete=models.CASCADE,
        related_name="photos",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="trip_photos",
    )
    uploaded_by_display_name_snapshot = models.CharField(max_length=161, blank=True, default="")
    uploaded_by_identify_tag_snapshot = models.CharField(max_length=31, null=True, blank=True)
    original_filename = models.CharField(max_length=160, blank=True, default="")
    original_width = models.PositiveIntegerField()
    original_height = models.PositiveIntegerField()
    thumbnail = models.ImageField(upload_to="trip-photos")
    medium = models.ImageField(upload_to="trip-photos")
    thumbnail_width = models.PositiveIntegerField()
    thumbnail_height = models.PositiveIntegerField()
    medium_width = models.PositiveIntegerField()
    medium_height = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["trip", "-created_at"], name="mem_photo_trip_created_idx"),
            models.Index(fields=["uploaded_by", "-created_at"], name="mem_photo_user_created_idx"),
        ]

    def __str__(self) -> str:
        return f"TripPhoto {self.id} trip={self.trip_id}"


class TripMemoryVideoStatus(models.TextChoices):
    QUEUED = "queued", "Queued"
    RENDERING = "rendering", "Rendering"
    READY = "ready", "Ready"
    FAILED = "failed", "Failed"


class TripMemoryVideoSourceMode(models.TextChoices):
    MANUAL = "manual", "Manual"
    AUTO = "auto", "Auto"


class TripMemoryVideo(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(
        "trips.Trip",
        on_delete=models.CASCADE,
        related_name="memory_videos",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="trip_memory_videos",
    )
    created_by_display_name_snapshot = models.CharField(max_length=161, blank=True, default="")
    created_by_identify_tag_snapshot = models.CharField(max_length=31, null=True, blank=True)
    title = models.CharField(max_length=120, blank=True, default="")
    status = models.CharField(
        max_length=16,
        choices=TripMemoryVideoStatus.choices,
        default=TripMemoryVideoStatus.QUEUED,
        db_index=True,
    )
    source_mode = models.CharField(max_length=16, choices=TripMemoryVideoSourceMode.choices)
    source_photo_ids = models.JSONField(default=list)
    source_photo_count = models.PositiveIntegerField(default=0)
    music_key = models.CharField(max_length=80)
    video_file = models.FileField(upload_to="trip-memory-videos", max_length=220, null=True, blank=True)
    poster_file = models.FileField(upload_to="trip-memory-videos", max_length=220, null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    render_error_code = models.CharField(max_length=64, blank=True, default="")
    render_error_message = models.CharField(max_length=240, blank=True, default="")
    celery_task_id = models.CharField(max_length=255, blank=True, default="")
    share_enabled = models.BooleanField(default=False)
    share_slug = models.CharField(max_length=96, unique=True, null=True, blank=True)
    share_created_at = models.DateTimeField(null=True, blank=True)
    render_started_at = models.DateTimeField(null=True, blank=True)
    render_finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["trip", "-created_at"], name="mem_video_trip_created_idx"),
            models.Index(fields=["created_by", "-created_at"], name="mem_video_user_created_idx"),
        ]

    def __str__(self) -> str:
        return f"TripMemoryVideo {self.id} trip={self.trip_id}"
