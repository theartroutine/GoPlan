from django.urls import path

from trips.views import TripDetailUpdateAPIView, TripListCreateAPIView

app_name = "trips"

urlpatterns = [
    path("", TripListCreateAPIView.as_view(), name="list-create"),
    path("/<uuid:trip_id>", TripDetailUpdateAPIView.as_view(), name="detail-update"),
]
