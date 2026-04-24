from __future__ import annotations

from rest_framework import serializers

from trips.models import MemberStatus, Trip, TripInvitation, TripMember


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
    budget_estimate = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True)

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
            "description", "status", "currency_code", "budget_estimate",
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
            "description", "status", "currency_code", "budget_estimate",
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
    budget_estimate = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True)

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
