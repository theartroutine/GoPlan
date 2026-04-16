from django.urls import path

from trips.views import TripListCreateAPIView

app_name = "trips"

urlpatterns = [
    path("", TripListCreateAPIView.as_view(), name="list-create"),
]
