from django.urls import include, path

# -------- API Routes --------
urlpatterns = [
    path("auth/", include("accounts.urls")),
    path("realtime/", include("realtime.urls")),
    path("notifications/", include("notifications.urls")),
    path("friends/", include("friends.urls")),
    path("trips/", include("trips.urls")),
    path("invitations/", include("trips.invitation_urls")),
]
