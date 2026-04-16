from __future__ import annotations

from rest_framework import serializers

from trips.models import MemberStatus, Trip


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
