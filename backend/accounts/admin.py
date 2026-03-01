from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from accounts.models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("-created_at",)
    list_display = ("email", "display_name", "identify_name", "identify_code", "is_profile_completed", "is_staff", "is_active", "date_joined")
    search_fields = ("email", "display_name", "identify_name")
    readonly_fields = ("id", "date_joined", "last_login", "created_at", "updated_at", "profile_completed_at")

    fieldsets = (
        ("Account", {"fields": ("id", "email", "password")}),
        (
            "Identity",
            {
                "fields": (
                    "first_name",
                    "last_name",
                    "display_name",
                    "identify_name",
                    "identify_code",
                    "is_profile_completed",
                    "profile_completed_at",
                )
            },
        ),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login", "date_joined", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2", "is_active", "is_staff"),
            },
        ),
    )
