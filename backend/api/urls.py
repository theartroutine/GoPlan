from django.urls import include, path

from memories.urls import public_urlpatterns as memory_public_urlpatterns

# -------- API Routes --------
urlpatterns = [
    path("auth/", include("accounts.urls")),
    path("realtime/", include("realtime.urls")),
    path("notifications/", include("notifications.urls")),
    path("friends/", include("friends.urls")),
    path("location-search/", include("location_search.urls")),
    path("trips/", include("trips.urls")),
    path("trips/", include("expenses.urls")),
    path("trips/", include("memories.urls")),
    path("public/memories/", include((memory_public_urlpatterns, "public_memories"))),
    path("trips/<uuid:trip_id>/chat/", include("chat.urls")),
    path("trips/<uuid:trip_id>/ai/", include("ai.urls")),
    path("invitations/", include("trips.invitation_urls")),
    path("media/", include("media.urls")),
]
