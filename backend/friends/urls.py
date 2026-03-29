from django.urls import path

from friends import views

app_name = "friends"

urlpatterns = [
    path("requests", views.SendFriendRequestAPIView.as_view(), name="send-request"),
    path("requests/incoming", views.IncomingFriendRequestsAPIView.as_view(), name="incoming"),
    path("requests/outgoing", views.OutgoingFriendRequestsAPIView.as_view(), name="outgoing"),
    path("requests/<uuid:id>/accept", views.AcceptFriendRequestAPIView.as_view(), name="accept"),
    path("requests/<uuid:id>/decline", views.DeclineFriendRequestAPIView.as_view(), name="decline"),
    path("requests/<uuid:id>/cancel", views.CancelFriendRequestAPIView.as_view(), name="cancel"),
    path("", views.FriendListAPIView.as_view(), name="list"),
    path("<uuid:id>", views.RemoveFriendAPIView.as_view(), name="remove"),
    path("search", views.UserSearchAPIView.as_view(), name="search"),
]
