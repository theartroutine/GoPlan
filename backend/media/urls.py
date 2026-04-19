from django.urls import path

from media.views import TripCoverUploadAPIView

app_name = "media"

urlpatterns = [
    path("trip-covers", TripCoverUploadAPIView.as_view(), name="trip_cover_upload"),
]
