from __future__ import annotations

from rest_framework import serializers

from trips.models import MemberStatus, Trip, TripMember


class CreateTripSerializer(serializers.Serializer):
    name            = serializers.CharField(max_length=120)
    destination     = serializers.CharField(max_length=200)
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
            "id", "name", "destination", "start_date", "end_date",
            "status", "currency_code", "budget_estimate",
            "member_count", "my_role",
        ]

    def get_member_count(self, obj) -> int:
        return obj.memberships.filter(status=MemberStatus.ACTIVE).count()

    def get_my_role(self, obj) -> str | None:
        request_user = self.context.get("request_user")
        if request_user is None:
            return None
        m = obj.memberships.filter(user=request_user, status=MemberStatus.ACTIVE).first()
        return m.role if m else None


class TripResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = [
            "id", "name", "destination", "start_date", "end_date",
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
            "id", "name", "destination", "start_date", "end_date",
            "description", "status", "currency_code", "budget_estimate",
            "cancelled_at", "created_at",
        ]


class UpdateTripSerializer(serializers.Serializer):
    name            = serializers.CharField(max_length=120, required=False)
    destination     = serializers.CharField(max_length=200, required=False)
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
