from __future__ import annotations

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from rest_framework import serializers

from trips.models import (
    MemberStatus,
    TimelineActivity,
    TimelineCustomType,
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

def _activity_payload(activity: TimelineActivity) -> dict:
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
    }

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
        "reminder_offsets_minutes": [],
    }


def _section_payload(section: TimelineSection) -> dict:
    return {
        "id": str(section.id),
        "kind": section.kind,
        "section_date": section.section_date.isoformat(),
        "label": section.label,
        "is_label_custom": section.is_label_custom,
        "position": section.position,
        "activities": [_activity_payload(a) for a in section.activities.all()],
    }


def build_timeline_response(
    *,
    trip: Trip,
    sections: list[TimelineSection],
    custom_types: list[TimelineCustomType],
    is_captain: bool,
    is_terminal: bool,
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
        "sections": [_section_payload(s) for s in sections],
    }
