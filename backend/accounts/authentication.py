from __future__ import annotations

from rest_framework_simplejwt.authentication import JWTAuthentication as BaseJWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class JWTAuthentication(BaseJWTAuthentication):

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        token_auth_version = validated_token.get("auth_version")
        if token_auth_version is None or token_auth_version != user.auth_version:
            raise InvalidToken("Token has been revoked.")
        return user
