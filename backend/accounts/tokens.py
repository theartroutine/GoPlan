from __future__ import annotations

from rest_framework_simplejwt.tokens import AccessToken as BaseAccessToken
from rest_framework_simplejwt.tokens import RefreshToken as BaseRefreshToken


class AccessToken(BaseAccessToken):

    @classmethod
    def for_user(cls, user):
        token = super().for_user(user)
        token["auth_version"] = user.auth_version
        return token


class RefreshToken(BaseRefreshToken):

    @classmethod
    def for_user(cls, user):
        token = super().for_user(user)
        token["auth_version"] = user.auth_version
        return token

    @property
    def access_token(self):
        access = AccessToken()
        access.set_exp(from_time=self.current_time)
        no_copy = self.no_copy_claims
        for claim, value in self.payload.items():
            if claim in no_copy:
                continue
            access[claim] = value
        return access
