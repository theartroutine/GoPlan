from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from realtime.services import issue_ws_ticket
from trips.permissions import IsProfileCompleted


class WebSocketTicketAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "realtime_ws_ticket"

    def post(self, request):
        ticket = issue_ws_ticket(request.user)
        return Response({"ticket": ticket}, status=status.HTTP_200_OK)


class WsTicketRefreshAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsProfileCompleted]
    throttle_scope = "ws_ticket_refresh"

    def post(self, request):
        ticket = issue_ws_ticket(request.user)
        return Response({"ticket": ticket}, status=status.HTTP_200_OK)
