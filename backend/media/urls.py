from django.urls import path

from media.views import PublicMediaFileAPIView, TripCoverUploadAPIView

app_name = "media"

urlpatterns = [
    path("trip-covers", TripCoverUploadAPIView.as_view(), name="trip_cover_upload"),
    path("files/<path:file_path>", PublicMediaFileAPIView.as_view(), name="public_media_file"),
]
