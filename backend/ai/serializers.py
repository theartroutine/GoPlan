from __future__ import annotations

from rest_framework import serializers


class AIActionDraftPatchSerializer(serializers.Serializer):
    payload = serializers.DictField(required=False)


class AIActionDraftEnvelopeSerializer(serializers.Serializer):
    draft = serializers.DictField()
