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
