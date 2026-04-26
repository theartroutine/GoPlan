from __future__ import annotations

from decimal import Decimal
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils.text import slugify
from rest_framework import serializers

from trips.models import (
    MemberStatus,
    TimelineActivity,
    TimelineActivityStatus,
    TimelineActivityTimeMode,
    TimelineCustomType,
    TimelineLocationMode,
    TimelineSection,
    TimelineSystemType,
    Trip,
    TripInvitation,
    TripMember,
)


# -------- Timeline static metadata --------

# Visual tokens for system activity types. Order is locked by the plan.
_SYSTEM_TYPE_METADATA: dict[str, dict[str, str]] = {
    TimelineSystemType.TRANSPORTATION: {"color_token": "sky",     "icon_key": "bus"},
    TimelineSystemType.ACCOMMODATION:  {"color_token": "amber",   "icon_key": "bed"},
    TimelineSystemType.FOOD:           {"color_token": "rose",    "icon_key": "utensils"},
    TimelineSystemType.SIGHTSEEING:    {"color_token": "emerald", "icon_key": "camera"},
    TimelineSystemType.SHOPPING:       {"color_token": "violet",  "icon_key": "shopping-bag"},
    TimelineSystemType.CHECKIN_OUT:    {"color_token": "indigo",  "icon_key": "key"},
    TimelineSystemType.FREE_TIME:      {"color_token": "teal",    "icon_key": "smile"},
    TimelineSystemType.OTHER:          {"color_token": "slate",   "icon_key": "tag"},
}


def system_type_payload(code: str) -> dict | None:
    """Return the static descriptor for a system type code, or None if blank/unknown."""
    if not code:
        return None
    if code not in _SYSTEM_TYPE_METADATA:
        return None
    meta = _SYSTEM_TYPE_METADATA[code]
    return {
        "kind": "SYSTEM",
        "code": code,
        "label": TimelineSystemType(code).label,
        "color_token": meta["color_token"],
        "icon_key": meta["icon_key"],
    }


def custom_type_payload(custom_type: TimelineCustomType) -> dict:
    return {
        "kind": "CUSTOM",
        "id": str(custom_type.id),
        "label": custom_type.name,
        "color_token": custom_type.color_token,
        "icon_key": custom_type.icon_key,
    }


def all_system_types_payload() -> list[dict]:
    """Return the full ordered list of system type metadata for the timeline GET response."""
    return [
        {
            "code": code.value,
            "label": code.label,
            "color_token": _SYSTEM_TYPE_METADATA[code.value]["color_token"],
            "icon_key": _SYSTEM_TYPE_METADATA[code.value]["icon_key"],
        }
        for code in TimelineSystemType
    ]


def _validate_iana_timezone(value: str) -> str:
    """Validate IANA timezone name. Raise DRF ValidationError on invalid input."""
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        raise serializers.ValidationError("Invalid trip timezone.")
    return value


class CreateTripSerializer(serializers.Serializer):
    name            = serializers.CharField(max_length=120)
    destination     = serializers.CharField(max_length=200)
    destination_provider     = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    destination_provider_id  = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    destination_lat          = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    destination_lng          = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    destination_country_code = serializers.CharField(max_length=2, required=False, allow_blank=True, default="")
    cover_image_url          = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    start_date      = serializers.DateField()
    end_date        = serializers.DateField()
    description     = serializers.CharField(required=False, allow_blank=True, default="")
    currency_code   = serializers.CharField(max_length=3, required=False, default="VND")
    timezone        = serializers.CharField(max_length=64, required=False, default="Asia/Ho_Chi_Minh")
    budget_estimate = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True)

    def validate_timezone(self, value):
        return _validate_iana_timezone(value)

    def validate(self, data):
        if data["end_date"] < data["start_date"]:
            raise serializers.ValidationError({"end_date": "end_date must be on or after start_date."})
        return data


class TripListItemSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    my_role      = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = [
            "id", "name", "destination", "cover_image_url",
            "start_date", "end_date",
            "status", "currency_code", "budget_estimate",
            "member_count", "my_role",
        ]

    def get_member_count(self, obj) -> int:
        annotated = getattr(obj, "active_member_count", None)
        if annotated is not None:
            return annotated
        # Fall back to the prefetch cache when the annotation is absent.
        return len(obj.memberships.all())

    def get_my_role(self, obj) -> str | None:
        request_user = self.context.get("request_user")
        if request_user is None:
            return None
        # Iterate prefetch cache instead of issuing a new filtered query per trip
        for m in obj.memberships.all():
            if m.user_id == request_user.pk:
                return m.role
        return None


class TripResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = [
            "id", "name", "destination",
            "destination_provider", "destination_provider_id", "destination_lat", "destination_lng",
            "destination_country_code", "cover_image_url",
            "start_date", "end_date",
            "description", "status", "currency_code", "timezone", "budget_estimate",
            "cancelled_at", "created_at",
        ]


class TripMemberSerializer(serializers.ModelSerializer):
    membership_id = serializers.UUIDField(source="id", read_only=True)
    user = serializers.SerializerMethodField()

    class Meta:
        model = TripMember
        fields = ["membership_id", "user", "role", "joined_at"]

    def get_user(self, obj):
        return {
            "id": str(obj.user.id),
            "display_name": obj.user.display_name,
            "identify_tag": obj.user.identify_tag,
        }


class TripDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = [
            "id", "name", "destination",
            "destination_provider", "destination_provider_id", "destination_lat", "destination_lng",
            "destination_country_code", "cover_image_url",
            "start_date", "end_date",
            "description", "status", "currency_code", "timezone", "budget_estimate",
            "cancelled_at", "created_at",
        ]


class UpdateTripSerializer(serializers.Serializer):
    name            = serializers.CharField(max_length=120, required=False)
    destination     = serializers.CharField(max_length=200, required=False)
    destination_provider     = serializers.CharField(max_length=32, required=False, allow_blank=True)
    destination_provider_id  = serializers.CharField(max_length=255, required=False, allow_blank=True)
    destination_lat          = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    destination_lng          = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    destination_country_code = serializers.CharField(max_length=2, required=False, allow_blank=True)
    cover_image_url          = serializers.CharField(max_length=500, required=False, allow_blank=True)
    start_date      = serializers.DateField(required=False)
    end_date        = serializers.DateField(required=False)
    description     = serializers.CharField(allow_blank=True, required=False)
    currency_code   = serializers.CharField(max_length=3, required=False)
    timezone        = serializers.CharField(max_length=64, required=False)
    budget_estimate = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True)

    def validate_timezone(self, value):
        return _validate_iana_timezone(value)

    def validate(self, data):
        trip = self.context.get("trip")
        start = data.get("start_date", trip.start_date if trip else None)
        end   = data.get("end_date",   trip.end_date   if trip else None)
        if start is not None and end is not None and end < start:
            raise serializers.ValidationError({"end_date": "end_date must be on or after start_date."})
        return data


class SendInvitationsSerializer(serializers.Serializer):
    invitee_ids = serializers.ListField(
        child=serializers.UUIDField(), min_length=1, max_length=20
    )

    def validate_invitee_ids(self, value):
        if len(value) != len(set(str(v) for v in value)):
            raise serializers.ValidationError("Duplicate user IDs are not allowed.")
        return value


class TripInvitationSerializer(serializers.ModelSerializer):
    invitee = serializers.SerializerMethodField()

    class Meta:
        model = TripInvitation
        fields = ["id", "invitee", "status", "created_at"]

    def get_invitee(self, obj):
        return {
            "id": str(obj.invitee.id),
            "display_name": obj.invitee.display_name,
            "identify_tag": obj.invitee.identify_tag,
        }


# -------- Timeline read --------

def _format_map_decimal(value) -> str:
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    return str(value)


def _build_timeline_open_url(activity: TimelineActivity) -> str | None:
    if activity.location_mode == TimelineLocationMode.STRUCTURED:
        title = activity.place_title or activity.location_label
        if activity.place_lat is not None and activity.place_lng is not None:
            slug = slugify(title) or "place"
            lat = _format_map_decimal(activity.place_lat)
            lng = _format_map_decimal(activity.place_lng)
            return f"https://share.here.com/l/{lat},{lng},{slug}"
        query = title or activity.place_address
    else:
        query = activity.location_label

    if not query:
        return None
    return f"https://share.here.com/r/{quote(query, safe='')}"


_CAPTAIN_STATUS_TARGETS = {
    TimelineActivityStatus.UPCOMING: {
        TimelineActivityStatus.IN_PROGRESS,
        TimelineActivityStatus.DONE,
        TimelineActivityStatus.CANCELLED,
    },
    TimelineActivityStatus.IN_PROGRESS: {
        TimelineActivityStatus.UPCOMING,
        TimelineActivityStatus.DONE,
        TimelineActivityStatus.CANCELLED,
    },
    TimelineActivityStatus.DONE: {
        TimelineActivityStatus.IN_PROGRESS,
        TimelineActivityStatus.UPCOMING,
        TimelineActivityStatus.CANCELLED,
    },
    TimelineActivityStatus.CANCELLED: {TimelineActivityStatus.UPCOMING},
}

_ASSIGNEE_STATUS_TARGETS = {
    TimelineActivityStatus.UPCOMING: {TimelineActivityStatus.IN_PROGRESS},
    TimelineActivityStatus.IN_PROGRESS: {
        TimelineActivityStatus.UPCOMING,
        TimelineActivityStatus.DONE,
    },
    TimelineActivityStatus.DONE: set(),
    TimelineActivityStatus.CANCELLED: set(),
}


def _can_update_any_status(
    activity: TimelineActivity,
    *,
    viewer_user_id,
    is_captain: bool,
    is_terminal: bool,
) -> bool:
    if is_terminal:
        return False
    if is_captain:
        return bool(_CAPTAIN_STATUS_TARGETS.get(activity.status))
    if activity.assignee_user_id is None or activity.assignee_user_id != viewer_user_id:
        return False
    return bool(_ASSIGNEE_STATUS_TARGETS.get(activity.status))


def _activity_payload(
    activity: TimelineActivity,
    *,
    viewer_user_id=None,
    is_captain: bool = False,
    is_terminal: bool = True,
) -> dict:
    if activity.system_type:
        activity_type = system_type_payload(activity.system_type)
    elif activity.custom_type_id is not None:
        activity_type = custom_type_payload(activity.custom_type)
    else:
        activity_type = None

    if activity.assignee_user_id is not None:
        assignee = {
            "id": str(activity.assignee_user.id),
            "display_name": activity.assignee_user.display_name,
            "identify_tag": activity.assignee_user.identify_tag,
        }
    else:
        assignee = None

    if activity.location_mode == "STRUCTURED" and activity.place_provider_id:
        place = {
            "provider": activity.place_provider,
            "provider_id": activity.place_provider_id,
            "title": activity.place_title,
            "address": activity.place_address,
            "lat": float(activity.place_lat) if activity.place_lat is not None else None,
            "lng": float(activity.place_lng) if activity.place_lng is not None else None,
        }
    else:
        place = None

    location = {
        "location_mode": activity.location_mode,
        "location_label": activity.location_label,
        "location_note": activity.location_note,
        "place": place,
        "open_url": _build_timeline_open_url(activity),
    }
    can_edit = is_captain and not is_terminal

    return {
        "id": str(activity.id),
        "title": activity.title,
        "time_mode": activity.time_mode,
        "start_time": activity.start_time.isoformat() if activity.start_time else None,
        "end_time": activity.end_time.isoformat() if activity.end_time else None,
        "status": activity.status,
        "position": activity.position,
        "activity_type": activity_type,
        "assignee": assignee,
        "location": location,
        "note": activity.note,
        "meeting_point": activity.meeting_point,
        "contact_name": activity.contact_name,
        "contact_phone": activity.contact_phone,
        "booking_reference": activity.booking_reference,
        "external_link": activity.external_link,
        "reminder_offsets_minutes": sorted(
            {r.offset_minutes_before for r in activity.reminders.all()},
            reverse=True,
        ),
        "capabilities": {
            "can_edit": can_edit,
            "can_delete": can_edit,
            "can_update_status": _can_update_any_status(
                activity,
                viewer_user_id=viewer_user_id,
                is_captain=is_captain,
                is_terminal=is_terminal,
            ),
        },
    }


def _section_payload(
    section: TimelineSection,
    *,
    viewer_user_id=None,
    is_captain: bool = False,
    is_terminal: bool = True,
) -> dict:
    return {
        "id": str(section.id),
        "kind": section.kind,
        "section_date": section.section_date.isoformat(),
        "label": section.label,
        "is_label_custom": section.is_label_custom,
        "position": section.position,
        "activities": [
            _activity_payload(
                a,
                viewer_user_id=viewer_user_id,
                is_captain=is_captain,
                is_terminal=is_terminal,
            )
            for a in section.activities.all()
        ],
    }


_REMINDER_PRESET_OFFSETS = {10080, 1440, 120, 30, 15}
_MAX_REMINDER_OFFSETS = 5


def normalize_custom_type_name(value: str) -> str:
    """Lowercase + collapse whitespace + strip."""
    return " ".join(value.lower().split())


def _validate_reminder_offsets(value):
    if value is None:
        return value
    if not isinstance(value, list):
        raise serializers.ValidationError("reminder_offsets_minutes must be a list of integers.")
    if len(value) > _MAX_REMINDER_OFFSETS:
        raise serializers.ValidationError(
            f"reminder_offsets_minutes can have at most {_MAX_REMINDER_OFFSETS} entries."
        )
    if len(set(value)) != len(value):
        raise serializers.ValidationError("reminder_offsets_minutes entries must be unique.")
    for v in value:
        if not isinstance(v, int) or isinstance(v, bool):
            raise serializers.ValidationError("reminder_offsets_minutes entries must be integers.")
        if v not in _REMINDER_PRESET_OFFSETS:
            raise serializers.ValidationError(
                "reminder_offsets_minutes must use allowed presets only."
            )
    return value


# -------- Section serializers --------

class CreateSpecialSectionSerializer(serializers.Serializer):
    section_date = serializers.DateField()
    label        = serializers.CharField(max_length=120)


class PatchSectionSerializer(serializers.Serializer):
    label        = serializers.CharField(max_length=120, required=False)
    section_date = serializers.DateField(required=False)


class ReorderSectionsSerializer(serializers.Serializer):
    section_date        = serializers.DateField()
    ordered_section_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)

    def validate_ordered_section_ids(self, value):
        if len(value) != len({str(v) for v in value}):
            raise serializers.ValidationError("ordered_section_ids must not contain duplicates.")
        return value


# -------- Activity serializers --------

class _PlaceSerializer(serializers.Serializer):
    provider     = serializers.CharField(max_length=16)
    provider_id  = serializers.CharField(max_length=255)
    title        = serializers.CharField(max_length=200)
    address      = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    lat          = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    lng          = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)


def _validate_activity_time_fields(time_mode: str, start_time, end_time) -> None:
    if time_mode == TimelineActivityTimeMode.ALL_DAY:
        if start_time is not None or end_time is not None:
            raise serializers.ValidationError(
                {"time_mode": "ALL_DAY activities cannot provide start_time or end_time."}
            )
    elif time_mode == TimelineActivityTimeMode.AT_TIME:
        if start_time is None:
            raise serializers.ValidationError({"start_time": "This field is required."})
        if end_time is not None:
            raise serializers.ValidationError(
                {"time_mode": "AT_TIME activities cannot provide end_time."}
            )
    elif time_mode == TimelineActivityTimeMode.TIME_RANGE:
        if start_time is None:
            raise serializers.ValidationError({"start_time": "This field is required."})
        if end_time is None:
            raise serializers.ValidationError({"end_time": "This field is required."})
        if end_time <= start_time:
            raise serializers.ValidationError(
                {"end_time": "end_time must be strictly after start_time."}
            )


def _validate_activity_type_selection(system_type: str, custom_type_id) -> None:
    has_system = bool(system_type)
    has_custom = custom_type_id is not None
    if has_system and has_custom:
        raise serializers.ValidationError(
            {"system_type": "Provide exactly one of system_type or custom_type_id."}
        )
    if not has_system and not has_custom:
        raise serializers.ValidationError(
            {"system_type": "Either system_type or custom_type_id is required."}
        )
    if has_system and system_type not in TimelineSystemType.values:
        raise serializers.ValidationError({"system_type": "Unknown system_type."})


def _validate_activity_location(location_mode: str, place) -> None:
    if location_mode == TimelineLocationMode.STRUCTURED:
        if not place:
            raise serializers.ValidationError({"place": "place is required when location_mode is STRUCTURED."})
        for required_field in ("provider", "provider_id", "title"):
            if not place.get(required_field):
                raise serializers.ValidationError(
                    {f"place.{required_field}": "This field is required for STRUCTURED locations."}
                )
    elif location_mode == TimelineLocationMode.MANUAL:
        if place:
            raise serializers.ValidationError(
                {"place": "place must be null when location_mode is MANUAL."}
            )


class CreateTimelineActivitySerializer(serializers.Serializer):
    title                    = serializers.CharField(max_length=140)
    time_mode                = serializers.ChoiceField(choices=TimelineActivityTimeMode.choices)
    start_time               = serializers.TimeField(required=False, allow_null=True)
    end_time                 = serializers.TimeField(required=False, allow_null=True)
    system_type              = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    custom_type_id           = serializers.UUIDField(required=False, allow_null=True)
    assignee_user_id         = serializers.UUIDField(required=False, allow_null=True)
    location_mode            = serializers.ChoiceField(
        choices=TimelineLocationMode.choices,
        default=TimelineLocationMode.MANUAL,
    )
    location_label           = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    location_note            = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    place                    = _PlaceSerializer(required=False, allow_null=True)
    note                     = serializers.CharField(required=False, allow_blank=True, default="")
    meeting_point            = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    contact_name             = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    contact_phone            = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    booking_reference        = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    external_link            = serializers.URLField(max_length=500, required=False, allow_blank=True, default="")
    reminder_offsets_minutes = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )

    def validate_reminder_offsets_minutes(self, value):
        return _validate_reminder_offsets(value)

    def validate(self, data):
        _validate_activity_time_fields(
            data["time_mode"], data.get("start_time"), data.get("end_time")
        )
        if data["time_mode"] == TimelineActivityTimeMode.ALL_DAY and data.get("reminder_offsets_minutes"):
            raise serializers.ValidationError(
                {"reminder_offsets_minutes": "ALL_DAY activities cannot have reminders."}
            )
        _validate_activity_type_selection(
            data.get("system_type", ""), data.get("custom_type_id")
        )
        _validate_activity_location(
            data.get("location_mode", TimelineLocationMode.MANUAL), data.get("place")
        )
        return data


class PatchTimelineActivitySerializer(serializers.Serializer):
    title                    = serializers.CharField(max_length=140, required=False)
    time_mode                = serializers.ChoiceField(choices=TimelineActivityTimeMode.choices, required=False)
    start_time               = serializers.TimeField(required=False, allow_null=True)
    end_time                 = serializers.TimeField(required=False, allow_null=True)
    system_type              = serializers.CharField(max_length=32, required=False, allow_blank=True)
    custom_type_id           = serializers.UUIDField(required=False, allow_null=True)
    assignee_user_id         = serializers.UUIDField(required=False, allow_null=True)
    location_mode            = serializers.ChoiceField(
        choices=TimelineLocationMode.choices, required=False
    )
    location_label           = serializers.CharField(max_length=200, required=False, allow_blank=True)
    location_note            = serializers.CharField(max_length=200, required=False, allow_blank=True)
    place                    = _PlaceSerializer(required=False, allow_null=True)
    note                     = serializers.CharField(required=False, allow_blank=True)
    meeting_point            = serializers.CharField(max_length=200, required=False, allow_blank=True)
    contact_name             = serializers.CharField(max_length=120, required=False, allow_blank=True)
    contact_phone            = serializers.CharField(max_length=32, required=False, allow_blank=True)
    booking_reference        = serializers.CharField(max_length=120, required=False, allow_blank=True)
    external_link            = serializers.URLField(max_length=500, required=False, allow_blank=True)
    reminder_offsets_minutes = serializers.ListField(
        child=serializers.IntegerField(), required=False
    )

    def validate_reminder_offsets_minutes(self, value):
        return _validate_reminder_offsets(value)

    def validate(self, data):
        if data.get("time_mode") == TimelineActivityTimeMode.ALL_DAY and data.get("reminder_offsets_minutes"):
            raise serializers.ValidationError(
                {"reminder_offsets_minutes": "ALL_DAY activities cannot have reminders."}
            )
        return data


class ReorderActivitiesSerializer(serializers.Serializer):
    ordered_activity_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)

    def validate_ordered_activity_ids(self, value):
        if len(value) != len({str(v) for v in value}):
            raise serializers.ValidationError("ordered_activity_ids must not contain duplicates.")
        return value


class UpdateTimelineActivityStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=TimelineActivityStatus.choices)


# -------- Custom type serializers --------

class CreateCustomTypeSerializer(serializers.Serializer):
    name        = serializers.CharField(max_length=40)
    color_token = serializers.CharField(max_length=24, required=False, default="slate")
    icon_key    = serializers.CharField(max_length=32, required=False, default="tag")

    def validate_name(self, value):
        normalized = normalize_custom_type_name(value)
        if not normalized:
            raise serializers.ValidationError("Name cannot be blank.")
        return value


class PatchCustomTypeSerializer(serializers.Serializer):
    name        = serializers.CharField(max_length=40, required=False)
    color_token = serializers.CharField(max_length=24, required=False)
    icon_key    = serializers.CharField(max_length=32, required=False)
    is_active   = serializers.BooleanField(required=False)

    def validate_name(self, value):
        normalized = normalize_custom_type_name(value)
        if not normalized:
            raise serializers.ValidationError("Name cannot be blank.")
        return value


# -------- Section/Activity single payloads (mutation responses) --------

def serialize_section(section: TimelineSection) -> dict:
    return _section_payload(section)


def serialize_activity(
    activity: TimelineActivity,
    *,
    viewer_user_id=None,
    is_captain: bool = False,
    is_terminal: bool = True,
) -> dict:
    return _activity_payload(
        activity,
        viewer_user_id=viewer_user_id,
        is_captain=is_captain,
        is_terminal=is_terminal,
    )


def serialize_custom_type(ct: TimelineCustomType) -> dict:
    return {
        "id": str(ct.id),
        "name": ct.name,
        "normalized_name": ct.normalized_name,
        "color_token": ct.color_token,
        "icon_key": ct.icon_key,
        "is_active": ct.is_active,
    }


def build_timeline_response(
    *,
    trip: Trip,
    sections: list[TimelineSection],
    custom_types: list[TimelineCustomType],
    is_captain: bool,
    is_terminal: bool,
    viewer_user_id,
) -> dict:
    can_edit = is_captain and not is_terminal
    return {
        "trip_timezone": trip.timezone,
        "permissions": {
            "can_edit_timeline": can_edit,
            "can_manage_custom_types": can_edit,
            "can_create_sections": can_edit,
        },
        "system_types": all_system_types_payload(),
        "custom_types": [
            {
                "id": str(ct.id),
                "name": ct.name,
                "normalized_name": ct.normalized_name,
                "color_token": ct.color_token,
                "icon_key": ct.icon_key,
                "is_active": ct.is_active,
            }
            for ct in custom_types
        ],
        "sections": [
            _section_payload(
                s,
                viewer_user_id=viewer_user_id,
                is_captain=is_captain,
                is_terminal=is_terminal,
            )
            for s in sections
        ],
    }
