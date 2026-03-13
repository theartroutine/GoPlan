from django.urls import re_path

from realtime.consumers import ConnectionConsumer

websocket_urlpatterns = [
    re_path(r"ws/connect$", ConnectionConsumer.as_asgi()),
]
