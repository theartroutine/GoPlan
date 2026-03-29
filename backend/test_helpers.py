from __future__ import annotations

from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


def create_verified_user(email="user@example.com", password="testpass123!", **extra_fields):
    user = User.objects.create_user(email=email, password=password)
    user.email_verified = True
    user.email_verified_at = timezone.now()

    for attr, value in extra_fields.items():
        setattr(user, attr, value)

    user.save()
    return user


def create_completed_user(
    email,
    identify_name,
    identify_code,
    password="testpass123!",
    *,
    first_name="Test",
    last_name="User",
    display_name="Test User",
    **extra_fields,
):
    user = create_verified_user(email=email, password=password)
    user.first_name = first_name
    user.last_name = last_name
    user.display_name = display_name
    user.identify_name = identify_name
    user.identify_code = identify_code
    user.is_profile_completed = True
    user.profile_completed_at = timezone.now()

    for attr, value in extra_fields.items():
        setattr(user, attr, value)

    user.save()
    return user
