from __future__ import annotations

import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from accounts.managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=80, blank=True, default="")
    last_name = models.CharField(max_length=80, blank=True, default="")
    display_name = models.CharField(max_length=161, blank=True, default="", db_index=True)
    identify_name = models.CharField(max_length=24, null=True, blank=True, db_index=True)
    identify_code = models.CharField(max_length=6, null=True, blank=True, unique=True, db_index=True)
    is_profile_completed = models.BooleanField(default=False, db_index=True)
    profile_completed_at = models.DateTimeField(null=True, blank=True)
    email_verified = models.BooleanField(default=False, db_index=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        db_table = "accounts_user"
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                name="accounts_user_profile_completed_fields_check",
                condition=(
                    models.Q(is_profile_completed=False)
                    | (
                        ~models.Q(first_name="")
                        & ~models.Q(last_name="")
                        & ~models.Q(display_name="")
                        & ~models.Q(identify_name__isnull=True)
                        & ~models.Q(identify_name="")
                        & ~models.Q(identify_code__isnull=True)
                        & ~models.Q(identify_code="")
                        & models.Q(profile_completed_at__isnull=False)
                    )
                ),
            )
        ]

    def save(self, *args, **kwargs):
        self.email = UserManager.normalize_email_value(self.email)
        super().save(*args, **kwargs)

    @property
    def identify_tag(self) -> str | None:
        if not self.identify_name or not self.identify_code:
            return None
        return f"{self.identify_name}#{self.identify_code}"

    @property
    def requires_email_verification(self) -> bool:
        return not self.email_verified and not self.is_staff and not self.is_superuser

    @property
    def requires_profile_setup(self) -> bool:
        return (
            not self.is_profile_completed
            and not self.is_staff
            and not self.is_superuser
        )

    def __str__(self) -> str:
        return self.email
