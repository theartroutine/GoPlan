from __future__ import annotations

import logging
import secrets
import time
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory

from django.conf import settings
from django.core.files import File
from django.core.files.storage import default_storage
from django.db import IntegrityError, transaction
from django.utils import timezone

from memories.memory_video_rendering import (
    MemoryVideoAudioSourceUnavailable,
    render_memory_video,
)
from memories.models import (
    TripMemoryVideo,
    TripMemoryVideoSourceMode,
    TripMemoryVideoStatus,
    TripPhoto,
)
# Single source of truth for the music catalog. Re-exported here so existing
# callers (serializers, views) keep importing from this module.
from memories.music_catalog import (  # noqa: F401
    MemoryMusicTrack,
    get_memory_music_track,
    list_memory_music_tracks,
)
from memories.services import _get_active_membership
from trips.models import TripRole, TripStatus
from trips.services import TripTerminalError

logger = logging.getLogger(__name__)


MEMORY_RENDER_ENQUEUE_FAILED = "MEMORY_RENDER_ENQUEUE_FAILED"
MEMORY_RENDER_FAILED = "MEMORY_RENDER_FAILED"
MEMORY_SOURCE_UNAVAILABLE = "MEMORY_SOURCE_UNAVAILABLE"
MEMORY_STORAGE_ERROR = "MEMORY_STORAGE_ERROR"
MEMORY_RENDER_TRIP_LIMIT_REACHED = "MEMORY_RENDER_TRIP_LIMIT_REACHED"


class _RenderTaskProxy:
    def apply_async(self, *args, **kwargs):
        from memories.tasks import render_trip_memory_video_task as task

        return task.apply_async(*args, **kwargs)


render_trip_memory_video_task = _RenderTaskProxy()


class MemoryVideoServiceError(Exception):
    error_code = "MEMORY_VIDEO_ERROR"

    def __init__(self, error_code: str | None = None, detail: str | None = None) -> None:
        self.error_code = error_code or self.error_code
        self.detail = detail or "Memory video request failed."
        super().__init__(self.detail)


class MemoryVideoValidationError(MemoryVideoServiceError):
    error_code = "MEMORY_INVALID_REQUEST"


class MemoryVideoNotFoundError(MemoryVideoServiceError):
    error_code = "MEMORY_NOT_FOUND"


class MemoryVideoPermissionError(MemoryVideoServiceError):
    error_code = "MEMORY_FORBIDDEN"


class MemoryVideoDeleteBlockedError(MemoryVideoServiceError):
    error_code = "MEMORY_DELETE_BLOCKED"


class MemoryVideoNotReadyError(MemoryVideoServiceError):
    error_code = "MEMORY_NOT_READY"


@dataclass(frozen=True)
class MemoryVideoPrivateAsset:
    memory: TripMemoryVideo
    field_name: str

    @property
    def field(self):
        return getattr(self.memory, self.field_name)


@dataclass(frozen=True)
class MemoryVideoPublicAsset:
    memory: TripMemoryVideo
    field_name: str

    @property
    def field(self):
        return getattr(self.memory, self.field_name)


def _setting(name: str, default: int) -> int:
    return int(getattr(settings, name, default))


def _min_photos() -> int:
    return _setting("TRIP_MEMORY_MIN_PHOTOS", 5)


def _max_photos() -> int:
    return _setting("TRIP_MEMORY_MAX_PHOTOS", 50)


def _auto_pick_photos() -> int:
    return _setting("TRIP_MEMORY_AUTO_PICK_PHOTOS", 20)


def _max_active_per_user_per_trip() -> int:
    return _setting("TRIP_MEMORY_MAX_ACTIVE_PER_USER_PER_TRIP", 1)


def _max_active_per_trip() -> int:
    return _setting("TRIP_MEMORY_MAX_ACTIVE_PER_TRIP", 3)


def memory_photo_limits() -> dict[str, int]:
    return {
        "min": _min_photos(),
        "max": _max_photos(),
        "auto_pick": _auto_pick_photos(),
    }


def _render_task_time_limits(source_photo_count: int) -> dict[str, int]:
    soft_floor = _setting("TRIP_MEMORY_RENDER_SOFT_TIME_LIMIT_SECONDS", 600)
    hard_floor = _setting("TRIP_MEMORY_RENDER_TIME_LIMIT_SECONDS", 720)
    per_photo_budget = _setting("TRIP_MEMORY_RENDER_SECONDS_PER_PHOTO_BUDGET", 24)
    hard_grace = _setting("TRIP_MEMORY_RENDER_TIME_LIMIT_GRACE_SECONDS", 120)
    soft_time_limit = max(soft_floor, source_photo_count * per_photo_budget)
    time_limit = max(hard_floor, soft_time_limit + hard_grace)
    return {
        "soft_time_limit": soft_time_limit,
        "time_limit": time_limit,
    }


def _validate_music_key(music_key: str) -> None:
    track = get_memory_music_track(music_key)
    if track is None or not track.enabled or track.placeholder:
        raise MemoryVideoValidationError(
            "MEMORY_INVALID_MUSIC",
            "Selected music track is not available.",
        )


def _select_random_music_key() -> str:
    tracks = list_memory_music_tracks()
    if not tracks:
        raise MemoryVideoValidationError(
            "MEMORY_INVALID_MUSIC",
            "No memory music tracks are available.",
        )
    return secrets.choice(tracks).key


def _resolve_music_key(music_key: str | None) -> str:
    if music_key:
        _validate_music_key(music_key)
        return music_key
    return _select_random_music_key()


def _assert_trip_accepts_memory_mutation(status: str) -> None:
    if status == TripStatus.CANCELLED:
        raise TripTerminalError("Cancelled trips cannot change memory videos.")


def _assert_active_memory_quota_available(*, trip_id, actor) -> None:
    active_statuses = [
        TripMemoryVideoStatus.QUEUED,
        TripMemoryVideoStatus.RENDERING,
    ]
    active_query = TripMemoryVideo.objects.filter(
        trip_id=trip_id,
        status__in=active_statuses,
    )

    if active_query.filter(created_by=actor).count() >= _max_active_per_user_per_trip():
        raise MemoryVideoValidationError(
            "MEMORY_RENDER_ALREADY_RUNNING",
            "Wait for your current memory video to finish before creating another.",
        )

    if active_query.count() >= _max_active_per_trip():
        raise MemoryVideoValidationError(
            MEMORY_RENDER_TRIP_LIMIT_REACHED,
            "This trip already has too many memory videos rendering.",
        )


def _get_memory_for_member(*, trip_id, memory_id, actor, for_update: bool = False):
    membership = _get_active_membership(trip_id, actor, for_update=for_update)
    queryset = TripMemoryVideo.objects.filter(pk=memory_id, trip_id=trip_id)
    if for_update:
        queryset = queryset.select_for_update()
    else:
        queryset = queryset.select_related("created_by")
    try:
        return membership, queryset.get()
    except TripMemoryVideo.DoesNotExist as exc:
        raise MemoryVideoNotFoundError("MEMORY_NOT_FOUND", "Memory video not found.") from exc


def _assert_can_manage(memory: TripMemoryVideo, membership) -> None:
    can_manage = (
        memory.created_by_id == membership.user_id
        or membership.role == TripRole.CAPTAIN
    )
    if not can_manage:
        raise MemoryVideoPermissionError(
            "MEMORY_FORBIDDEN",
            "You do not have permission to manage this memory video.",
        )


def _usable_trip_photos_queryset(trip_id):
    return (
        TripPhoto.objects
        .filter(trip_id=trip_id)
        .exclude(medium="")
        .order_by("created_at", "id")
    )


def _validate_photo_count(count: int) -> None:
    if count < _min_photos() or count > _max_photos():
        raise MemoryVideoValidationError(
            "MEMORY_INVALID_PHOTO_SELECTION",
            f"Select between {_min_photos()} and {_max_photos()} usable photos.",
        )


def _resolve_manual_photos(*, trip_id, photo_ids: list) -> list[TripPhoto]:
    _validate_photo_count(len(photo_ids))
    normalized_ids = [str(photo_id) for photo_id in photo_ids]
    if len(normalized_ids) != len(set(normalized_ids)):
        raise MemoryVideoValidationError(
            "MEMORY_INVALID_PHOTO_SELECTION",
            "Photo selection cannot contain duplicates.",
        )

    photos_by_id = {
        str(photo.id): photo
        for photo in _usable_trip_photos_queryset(trip_id).filter(id__in=photo_ids)
    }
    if len(photos_by_id) != len(normalized_ids):
        raise MemoryVideoValidationError(
            "MEMORY_INVALID_PHOTO_SELECTION",
            "All selected photos must belong to this trip and have a usable medium asset.",
        )
    return [photos_by_id[photo_id] for photo_id in normalized_ids]


def select_auto_pick_photos(*, trip_id, actor) -> list[TripPhoto]:
    _get_active_membership(trip_id, actor)
    photos = list(_usable_trip_photos_queryset(trip_id))
    if len(photos) < _min_photos():
        raise MemoryVideoValidationError(
            "MEMORY_INVALID_PHOTO_SELECTION",
            f"At least {_min_photos()} usable photos are required.",
        )

    target_count = min(_auto_pick_photos(), len(photos))
    if len(photos) <= target_count:
        return photos

    if target_count <= 1:
        return photos[:target_count]

    max_index = len(photos) - 1
    selected_indexes = [
        round(index * max_index / (target_count - 1))
        for index in range(target_count)
    ]
    return [photos[index] for index in selected_indexes]


def list_trip_memory_videos(*, trip_id, actor):
    _get_active_membership(trip_id, actor)
    return (
        TripMemoryVideo.objects
        .filter(trip_id=trip_id)
        .select_related("created_by")
        .order_by("-created_at", "-id")
    )


def list_trip_memory_video_statuses(*, trip_id, actor, memory_ids: list[str]):
    _get_active_membership(trip_id, actor)
    if not memory_ids:
        return TripMemoryVideo.objects.none()
    return (
        TripMemoryVideo.objects
        .filter(trip_id=trip_id, id__in=memory_ids)
        .select_related("created_by")
        .order_by("-created_at", "-id")
    )


def get_trip_memory_video(*, trip_id, memory_id, actor) -> TripMemoryVideo:
    _membership, memory = _get_memory_for_member(
        trip_id=trip_id,
        memory_id=memory_id,
        actor=actor,
    )
    return memory


def _get_private_memory_asset(
    *,
    trip_id,
    memory_id,
    actor,
    field_name: str,
) -> MemoryVideoPrivateAsset:
    _membership, memory = _get_memory_for_member(
        trip_id=trip_id,
        memory_id=memory_id,
        actor=actor,
    )
    if memory.status != TripMemoryVideoStatus.READY or not _memory_field_exists(
        memory, field_name
    ):
        raise MemoryVideoNotReadyError(
            "MEMORY_NOT_READY",
            "Memory video is not ready yet.",
        )
    return MemoryVideoPrivateAsset(memory=memory, field_name=field_name)


def _memory_field_exists(memory: TripMemoryVideo, field_name: str) -> bool:
    field = getattr(memory, field_name)
    if not field or not field.name:
        return False
    try:
        return field.storage.exists(field.name)
    except Exception:
        logger.warning(
            "Failed to check memory video public asset %s for %s",
            field_name,
            memory.id,
            exc_info=True,
        )
        return False


def memory_video_can_download(memory: TripMemoryVideo) -> bool:
    return (
        memory.status == TripMemoryVideoStatus.READY
        and _memory_field_exists(memory, "video_file")
    )


def _is_public_memory_viewable(memory: TripMemoryVideo) -> bool:
    return (
        memory.share_enabled
        and bool(memory.share_slug)
        and memory.status == TripMemoryVideoStatus.READY
        and _memory_field_exists(memory, "video_file")
        and _memory_field_exists(memory, "poster_file")
    )


def _assert_memory_shareable(memory: TripMemoryVideo) -> None:
    is_ready = (
        memory.status == TripMemoryVideoStatus.READY
        and _memory_field_exists(memory, "video_file")
        and _memory_field_exists(memory, "poster_file")
    )
    if not is_ready:
        raise MemoryVideoNotReadyError(
            "MEMORY_NOT_READY",
            "Memory video is not ready to share yet.",
        )


def get_public_memory_video(*, share_slug: str) -> TripMemoryVideo:
    try:
        memory = TripMemoryVideo.objects.get(share_slug=share_slug)
    except TripMemoryVideo.DoesNotExist as exc:
        raise MemoryVideoNotFoundError(
            "MEMORY_NOT_FOUND",
            "Memory video not found.",
        ) from exc

    if not _is_public_memory_viewable(memory):
        raise MemoryVideoNotFoundError(
            "MEMORY_NOT_FOUND",
            "Memory video not found.",
        )
    return memory


def _get_public_memory_asset(
    *,
    share_slug: str,
    field_name: str,
) -> MemoryVideoPublicAsset:
    memory = get_public_memory_video(share_slug=share_slug)
    return MemoryVideoPublicAsset(memory=memory, field_name=field_name)


def get_public_memory_video_file(*, share_slug: str) -> MemoryVideoPublicAsset:
    return _get_public_memory_asset(
        share_slug=share_slug,
        field_name="video_file",
    )


def get_public_memory_poster_file(*, share_slug: str) -> MemoryVideoPublicAsset:
    return _get_public_memory_asset(
        share_slug=share_slug,
        field_name="poster_file",
    )


def get_private_memory_video_file(*, trip_id, memory_id, actor) -> MemoryVideoPrivateAsset:
    return _get_private_memory_asset(
        trip_id=trip_id,
        memory_id=memory_id,
        actor=actor,
        field_name="video_file",
    )


def get_private_memory_download_file(*, trip_id, memory_id, actor) -> MemoryVideoPrivateAsset:
    return get_private_memory_video_file(
        trip_id=trip_id,
        memory_id=memory_id,
        actor=actor,
    )


def get_private_memory_poster_file(*, trip_id, memory_id, actor) -> MemoryVideoPrivateAsset:
    return _get_private_memory_asset(
        trip_id=trip_id,
        memory_id=memory_id,
        actor=actor,
        field_name="poster_file",
    )


def create_trip_memory_video(
    *,
    trip_id,
    actor,
    title: str,
    source_mode: str,
    photo_ids: list,
    music_key: str | None = None,
) -> TripMemoryVideo:
    membership = _get_active_membership(trip_id, actor)
    trip = membership.trip
    _assert_trip_accepts_memory_mutation(trip.status)
    resolved_music_key = _resolve_music_key(music_key)

    if source_mode == TripMemoryVideoSourceMode.MANUAL:
        selected_photos = _resolve_manual_photos(trip_id=trip_id, photo_ids=photo_ids)
    elif source_mode == TripMemoryVideoSourceMode.AUTO:
        selected_photos = select_auto_pick_photos(trip_id=trip_id, actor=actor)
    else:
        raise MemoryVideoValidationError(
            "MEMORY_INVALID_SOURCE_MODE",
            "Select a valid memory video source mode.",
        )

    source_photo_ids = [str(photo.id) for photo in selected_photos]
    with transaction.atomic():
        membership.trip.__class__.objects.select_for_update().get(pk=trip.pk)
        _assert_active_memory_quota_available(trip_id=trip_id, actor=actor)
        memory = TripMemoryVideo.objects.create(
            trip=trip,
            created_by=actor,
            created_by_display_name_snapshot=actor.display_name,
            created_by_identify_tag_snapshot=actor.identify_tag,
            title=title,
            status=TripMemoryVideoStatus.QUEUED,
            source_mode=source_mode,
            source_photo_ids=source_photo_ids,
            source_photo_count=len(source_photo_ids),
            music_key=resolved_music_key,
        )
        transaction.on_commit(
            lambda memory_id=str(memory.id), source_photo_count=memory.source_photo_count: (
                _enqueue_trip_memory_render(
                    memory_id,
                    source_photo_count=source_photo_count,
                )
            )
        )
    memory.refresh_from_db()
    return memory


def _enqueue_trip_memory_render(memory_id: str, *, source_photo_count: int) -> None:
    try:
        async_result = render_trip_memory_video_task.apply_async(
            args=[str(memory_id)],
            queue=settings.TRIP_MEMORY_RENDER_QUEUE,
            **_render_task_time_limits(source_photo_count),
        )
    except Exception:
        logger.exception("Failed to enqueue memory video render %s", memory_id)
        _mark_memory_render_failed(
            memory_id=memory_id,
            error_code=MEMORY_RENDER_ENQUEUE_FAILED,
            message="Memory video render could not be queued.",
        )
        return

    task_id = getattr(async_result, "id", None)
    if task_id:
        TripMemoryVideo.objects.filter(
            pk=memory_id,
            status=TripMemoryVideoStatus.QUEUED,
        ).update(
            celery_task_id=str(task_id),
            updated_at=timezone.now(),
        )


class MemoryVideoRenderSourceError(Exception):
    pass


class MemoryVideoRenderStorageError(Exception):
    pass


class MemoryVideoRenderActiveError(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        self.retry_after_seconds = max(1, retry_after_seconds)
        super().__init__("Memory video render is already active.")


def _claim_memory_for_render(memory_id: str) -> TripMemoryVideo | None:
    with transaction.atomic():
        now = timezone.now()
        stale_seconds = _setting("TRIP_MEMORY_RENDER_STALE_SECONDS", 15 * 60)
        stale_cutoff = now - timezone.timedelta(seconds=stale_seconds)
        memory = (
            TripMemoryVideo.objects
            .select_for_update()
            .filter(pk=memory_id)
            .first()
        )
        if memory is None:
            return None

        if memory.status == TripMemoryVideoStatus.RENDERING:
            render_started_at = memory.render_started_at
            if render_started_at is not None and render_started_at >= stale_cutoff:
                stale_at = render_started_at + timezone.timedelta(seconds=stale_seconds)
                retry_after_seconds = int((stale_at - now).total_seconds()) + 1
                raise MemoryVideoRenderActiveError(retry_after_seconds)

        can_claim = (
            memory.status == TripMemoryVideoStatus.QUEUED
            or (
                memory.status == TripMemoryVideoStatus.RENDERING
                and (
                    memory.render_started_at is None
                    or memory.render_started_at < stale_cutoff
                )
            )
        )
        if not can_claim:
            return None

        memory.status = TripMemoryVideoStatus.RENDERING
        memory.render_started_at = now
        memory.render_finished_at = None
        memory.render_error_code = ""
        memory.render_error_message = ""
        memory.save(
            update_fields=[
                "status",
                "render_started_at",
                "render_finished_at",
                "render_error_code",
                "render_error_message",
                "updated_at",
            ]
        )
        return memory


def _mark_memory_render_failed(
    *,
    memory_id: str,
    error_code: str,
    message: str,
    expected_started_at=None,
) -> None:
    now = timezone.now()
    queryset = TripMemoryVideo.objects.filter(pk=memory_id)
    if expected_started_at is not None:
        queryset = queryset.filter(
            status=TripMemoryVideoStatus.RENDERING,
            render_started_at=expected_started_at,
        )
    queryset.update(
        status=TripMemoryVideoStatus.FAILED,
        render_finished_at=now,
        render_error_code=error_code,
        render_error_message=message[:240],
        updated_at=now,
    )


def _resolve_render_source_photos(memory: TripMemoryVideo) -> list[TripPhoto]:
    source_photo_ids = [str(photo_id) for photo_id in memory.source_photo_ids]
    if not source_photo_ids:
        raise MemoryVideoRenderSourceError("No source photos are available.")

    photos_by_id = {
        str(photo.id): photo
        for photo in (
            TripPhoto.objects
            .filter(trip_id=memory.trip_id, id__in=source_photo_ids)
            .exclude(medium="")
        )
    }
    if len(photos_by_id) != len(source_photo_ids):
        raise MemoryVideoRenderSourceError("One or more source photos are unavailable.")
    return [photos_by_id[photo_id] for photo_id in source_photo_ids]


def _copy_storage_file_to_path(storage_name: str, destination: Path) -> None:
    try:
        if not default_storage.exists(storage_name):
            raise MemoryVideoRenderSourceError("A source photo file is missing.")
        with default_storage.open(storage_name, "rb") as source, destination.open("wb") as target:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                target.write(chunk)
    except MemoryVideoRenderSourceError:
        raise
    except Exception as exc:
        raise MemoryVideoRenderSourceError("A source photo file could not be read.") from exc


def _stage_render_source_photos(*, photos: list[TripPhoto], directory: Path) -> list[Path]:
    staged_paths: list[Path] = []
    for index, photo in enumerate(photos):
        medium_name = photo.medium.name
        if not medium_name:
            raise MemoryVideoRenderSourceError("A source photo file is missing.")
        suffix = Path(medium_name).suffix or ".img"
        staged_path = directory / f"source-{index:04d}{suffix}"
        _copy_storage_file_to_path(medium_name, staged_path)
        staged_paths.append(staged_path)
    return staged_paths


def _memory_video_render_attempt_storage_name(
    memory: TripMemoryVideo,
    attempt_key: str,
    filename: str,
) -> str:
    return f"trip-memory-videos/{memory.id}/r/{attempt_key}/{filename}"


def _save_file_to_storage(*, source_path: Path, storage_name: str) -> str:
    try:
        with source_path.open("rb") as source:
            return default_storage.save(storage_name, File(source))
    except Exception as exc:
        raise MemoryVideoRenderStorageError("Rendered memory video could not be stored.") from exc


def _finish_memory_render_success(
    *,
    memory: TripMemoryVideo,
    video_path: Path,
    poster_path: Path,
    duration_seconds: int,
) -> None:
    saved_video_name = ""
    saved_poster_name = ""
    try:
        attempt_key = secrets.token_urlsafe(12)
        saved_video_name = _save_file_to_storage(
            source_path=video_path,
            storage_name=_memory_video_render_attempt_storage_name(
                memory,
                attempt_key,
                "video.mp4",
            ),
        )
        saved_poster_name = _save_file_to_storage(
            source_path=poster_path,
            storage_name=_memory_video_render_attempt_storage_name(
                memory,
                attempt_key,
                "poster.webp",
            ),
        )
        now = timezone.now()
        with transaction.atomic():
            updated = TripMemoryVideo.objects.filter(
                pk=memory.id,
                status=TripMemoryVideoStatus.RENDERING,
                render_started_at=memory.render_started_at,
            ).update(
                video_file=saved_video_name,
                poster_file=saved_poster_name,
                duration_seconds=duration_seconds,
                status=TripMemoryVideoStatus.READY,
                render_finished_at=now,
                render_error_code="",
                render_error_message="",
                updated_at=now,
            )
        if not updated:
            _delete_storage_file_best_effort(saved_video_name)
            _delete_storage_file_best_effort(saved_poster_name)
    except Exception as exc:
        _delete_storage_file_best_effort(saved_video_name)
        _delete_storage_file_best_effort(saved_poster_name)
        if isinstance(exc, MemoryVideoRenderStorageError):
            raise
        raise MemoryVideoRenderStorageError("Rendered memory video could not be stored.") from exc


def render_trip_memory_video(memory_id: str) -> None:
    memory = _claim_memory_for_render(memory_id)
    if memory is None:
        return

    expected_started_at = memory.render_started_at
    photo_count = memory.source_photo_count
    render_log_status = "unknown"
    started_monotonic = time.monotonic()
    try:
        source_photos = _resolve_render_source_photos(memory)
        with TemporaryDirectory() as tempdir:
            temp_path = Path(tempdir)
            staged_source_paths = _stage_render_source_photos(
                photos=source_photos,
                directory=temp_path,
            )
            output_video_path = temp_path / "video.mp4"
            output_poster_path = temp_path / "poster.webp"
            render_result = render_memory_video(
                source_image_paths=staged_source_paths,
                output_video_path=output_video_path,
                output_poster_path=output_poster_path,
                music_key=memory.music_key,
            )
            _finish_memory_render_success(
                memory=memory,
                video_path=output_video_path,
                poster_path=output_poster_path,
                duration_seconds=render_result.duration_seconds,
            )
            render_log_status = TripMemoryVideoStatus.READY
    except (MemoryVideoRenderSourceError, MemoryVideoAudioSourceUnavailable) as exc:
        render_log_status = MEMORY_SOURCE_UNAVAILABLE
        _mark_memory_render_failed(
            memory_id=memory_id,
            error_code=MEMORY_SOURCE_UNAVAILABLE,
            message=str(exc) or "A source asset is unavailable.",
            expected_started_at=expected_started_at,
        )
    except MemoryVideoRenderStorageError as exc:
        render_log_status = MEMORY_STORAGE_ERROR
        logger.exception("Memory video storage failed for %s", memory_id)
        _mark_memory_render_failed(
            memory_id=memory_id,
            error_code=MEMORY_STORAGE_ERROR,
            message=str(exc) or "Rendered memory video could not be stored.",
            expected_started_at=expected_started_at,
        )
    except Exception as exc:
        render_log_status = MEMORY_RENDER_FAILED
        logger.exception("Memory video render failed for %s", memory_id)
        _mark_memory_render_failed(
            memory_id=memory_id,
            error_code=MEMORY_RENDER_FAILED,
            message=str(exc) or "Memory video render failed.",
            expected_started_at=expected_started_at,
        )
    finally:
        elapsed_seconds = time.monotonic() - started_monotonic
        logger.info(
            "Memory video render finished for %s with status=%s photo_count=%s elapsed_seconds=%.2f",
            memory_id,
            render_log_status,
            photo_count,
            elapsed_seconds,
        )


def update_trip_memory_video(*, trip_id, memory_id, actor, title: str) -> TripMemoryVideo:
    with transaction.atomic():
        membership, memory = _get_memory_for_member(
            trip_id=trip_id,
            memory_id=memory_id,
            actor=actor,
            for_update=True,
        )
        _assert_trip_accepts_memory_mutation(membership.trip.status)
        _assert_can_manage(memory, membership)
        memory.title = title
        memory.save(update_fields=["title", "updated_at"])
        return memory


def _delete_storage_file_best_effort(name: str) -> None:
    if not name:
        return
    try:
        default_storage.delete(name)
    except Exception:
        logger.warning("Failed to clean up memory video storage file %s", name, exc_info=True)


def delete_trip_memory_video(*, trip_id, memory_id, actor) -> None:
    with transaction.atomic():
        membership, memory = _get_memory_for_member(
            trip_id=trip_id,
            memory_id=memory_id,
            actor=actor,
            for_update=True,
        )
        _assert_trip_accepts_memory_mutation(membership.trip.status)
        _assert_can_manage(memory, membership)
        if memory.status in {TripMemoryVideoStatus.QUEUED, TripMemoryVideoStatus.RENDERING}:
            raise MemoryVideoDeleteBlockedError(
                "MEMORY_DELETE_BLOCKED",
                "Memory video cannot be deleted while it is queued or rendering.",
            )

        video_name = memory.video_file.name
        poster_name = memory.poster_file.name
        memory.delete()

    _delete_storage_file_best_effort(video_name)
    _delete_storage_file_best_effort(poster_name)


def _generate_share_slug() -> str:
    return secrets.token_urlsafe(48)[:64]


def _generate_unique_share_slug() -> str:
    for _attempt in range(5):
        slug = _generate_share_slug()
        if not TripMemoryVideo.objects.filter(share_slug=slug).exists():
            return slug
    raise MemoryVideoServiceError(
        "MEMORY_SHARE_UNAVAILABLE",
        "Could not create a share link right now.",
    )


def build_memory_share_url(*, public_base_url: str, slug: str | None) -> str | None:
    if not slug:
        return None
    return f"{public_base_url.rstrip('/')}/share/memories/{slug}"


def enable_memory_share_link(*, trip_id, memory_id, actor, public_base_url: str) -> tuple[TripMemoryVideo, str]:
    with transaction.atomic():
        membership, memory = _get_memory_for_member(
            trip_id=trip_id,
            memory_id=memory_id,
            actor=actor,
            for_update=True,
        )
        _assert_trip_accepts_memory_mutation(membership.trip.status)
        _assert_can_manage(memory, membership)
        _assert_memory_shareable(memory)

        if not memory.share_slug:
            for _attempt in range(5):
                memory.share_slug = _generate_unique_share_slug()
                memory.share_enabled = True
                memory.share_created_at = timezone.now()
                try:
                    with transaction.atomic():
                        memory.save(
                            update_fields=[
                                "share_enabled",
                                "share_slug",
                                "share_created_at",
                                "updated_at",
                            ]
                        )
                    break
                except IntegrityError:
                    memory.share_slug = None
            else:
                raise MemoryVideoServiceError(
                    "MEMORY_SHARE_UNAVAILABLE",
                    "Could not create a share link right now.",
                )
        else:
            memory.share_enabled = True
            if memory.share_created_at is None:
                memory.share_created_at = timezone.now()
            memory.save(update_fields=["share_enabled", "share_created_at", "updated_at"])

    url = build_memory_share_url(public_base_url=public_base_url, slug=memory.share_slug)
    return memory, url or ""


def disable_memory_share_link(*, trip_id, memory_id, actor) -> TripMemoryVideo:
    with transaction.atomic():
        membership, memory = _get_memory_for_member(
            trip_id=trip_id,
            memory_id=memory_id,
            actor=actor,
            for_update=True,
        )
        _assert_trip_accepts_memory_mutation(membership.trip.status)
        _assert_can_manage(memory, membership)
        memory.share_enabled = False
        memory.share_slug = None
        memory.share_created_at = None
        memory.save(
            update_fields=[
                "share_enabled",
                "share_slug",
                "share_created_at",
                "updated_at",
            ]
        )
        return memory
