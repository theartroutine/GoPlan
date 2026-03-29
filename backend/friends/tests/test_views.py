from __future__ import annotations

import uuid

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from friends.models import FriendRequest, FriendRequestStatus, Friendship
from friends.services import send_friend_request
from test_helpers import create_completed_user

User = get_user_model()

SEND_REQUEST_URL = "/api/friends/requests"
INCOMING_URL = "/api/friends/requests/incoming"
OUTGOING_URL = "/api/friends/requests/outgoing"
FRIEND_LIST_URL = "/api/friends/"
SEARCH_URL = "/api/friends/search"


def _accept_url(fr_id):
    return f"/api/friends/requests/{fr_id}/accept"


def _decline_url(fr_id):
    return f"/api/friends/requests/{fr_id}/decline"


def _cancel_url(fr_id):
    return f"/api/friends/requests/{fr_id}/cancel"


def _remove_url(friendship_id):
    return f"/api/friends/{friendship_id}"


def _auth_header(user):
    token = AccessToken.for_user(user)
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


class SendRequestTests(APITestCase):

    def setUp(self):
        self.alice = create_completed_user("alice@example.com", "alice", "ABC123")
        self.bob = create_completed_user("bob@example.com", "bob", "DEF456")

    def test_send_request_201(self):
        response = self.client.post(
            SEND_REQUEST_URL,
            {"identify_tag": "bob#DEF456"},
            format="json",
            **_auth_header(self.alice),
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("friend_request", response.data)
        self.assertEqual(response.data["friend_request"]["status"], "PENDING")

    def test_send_request_self_400(self):
        response = self.client.post(
            SEND_REQUEST_URL,
            {"identify_tag": "alice#ABC123"},
            format="json",
            **_auth_header(self.alice),
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error_code"], "SELF_REQUEST")

    def test_send_request_duplicate_409(self):
        self.client.post(
            SEND_REQUEST_URL,
            {"identify_tag": "bob#DEF456"},
            format="json",
            **_auth_header(self.alice),
        )
        response = self.client.post(
            SEND_REQUEST_URL,
            {"identify_tag": "bob#DEF456"},
            format="json",
            **_auth_header(self.alice),
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "DUPLICATE_PENDING")

    def test_send_request_already_friends_409(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        from friends.services import accept_friend_request
        accept_friend_request(fr.id, self.bob)

        response = self.client.post(
            SEND_REQUEST_URL,
            {"identify_tag": "bob#DEF456"},
            format="json",
            **_auth_header(self.alice),
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error_code"], "ALREADY_FRIENDS")

    def test_send_request_malformed_tag_400(self):
        response = self.client.post(
            SEND_REQUEST_URL,
            {"identify_tag": "invalidtag"},
            format="json",
            **_auth_header(self.alice),
        )
        self.assertEqual(response.status_code, 400)

    def test_send_request_normalizes_identify_tag(self):
        response = self.client.post(
            SEND_REQUEST_URL,
            {"identify_tag": "  BoB # def456  "},
            format="json",
            **_auth_header(self.alice),
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.data["friend_request"]["receiver"]["identify_tag"],
            "bob#DEF456",
        )


class RespondToRequestTests(APITestCase):

    def setUp(self):
        self.alice = create_completed_user("alice@example.com", "alice", "ABC123")
        self.bob = create_completed_user("bob@example.com", "bob", "DEF456")
        self.charlie = create_completed_user("charlie@example.com", "charlie", "GHI789")

    def test_accept_200(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        response = self.client.post(
            _accept_url(fr.id), **_auth_header(self.bob)
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("friendship", response.data)
        self.assertIn("friend_request_id", response.data)

    def test_accept_wrong_user_403(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        response = self.client.post(
            _accept_url(fr.id), **_auth_header(self.charlie)
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error_code"], "NOT_REQUEST_PARTICIPANT")

    def test_decline_200(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        response = self.client.post(
            _decline_url(fr.id), **_auth_header(self.bob)
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["friend_request"]["status"], "DECLINED"
        )

    def test_cancel_200(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        response = self.client.post(
            _cancel_url(fr.id), **_auth_header(self.alice)
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["friend_request"]["status"], "CANCELLED"
        )


class ListTests(APITestCase):

    def setUp(self):
        self.alice = create_completed_user("alice@example.com", "alice", "ABC123")
        self.bob = create_completed_user("bob@example.com", "bob", "DEF456")
        self.charlie = create_completed_user("charlie@example.com", "charlie", "GHI789")

    def test_incoming_list(self):
        send_friend_request(self.alice, "bob#DEF456")
        send_friend_request(self.charlie, "bob#DEF456")

        response = self.client.get(INCOMING_URL, **_auth_header(self.bob))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 2)

    def test_outgoing_list(self):
        send_friend_request(self.alice, "bob#DEF456")
        send_friend_request(self.alice, "charlie#GHI789")

        response = self.client.get(OUTGOING_URL, **_auth_header(self.alice))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)

    def test_friend_list(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        from friends.services import accept_friend_request
        accept_friend_request(fr.id, self.bob)

        response = self.client.get(FRIEND_LIST_URL, **_auth_header(self.alice))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["user"]["identify_tag"], "bob#DEF456"
        )


class RemoveFriendTests(APITestCase):

    def setUp(self):
        self.alice = create_completed_user("alice@example.com", "alice", "ABC123")
        self.bob = create_completed_user("bob@example.com", "bob", "DEF456")
        self.charlie = create_completed_user("charlie@example.com", "charlie", "GHI789")

    def test_unfriend_204(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        from friends.services import accept_friend_request
        friendship = accept_friend_request(fr.id, self.bob)

        response = self.client.delete(
            _remove_url(friendship.id), **_auth_header(self.alice)
        )
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Friendship.objects.count(), 0)

    def test_unfriend_wrong_user_403(self):
        fr = send_friend_request(self.alice, "bob#DEF456")
        from friends.services import accept_friend_request
        friendship = accept_friend_request(fr.id, self.bob)

        response = self.client.delete(
            _remove_url(friendship.id), **_auth_header(self.charlie)
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error_code"], "NOT_FRIENDSHIP_PARTICIPANT")


class SearchViewTests(APITestCase):

    def setUp(self):
        self.alice = create_completed_user("alice@example.com", "alice", "ABC123")
        self.bob = create_completed_user("bob@example.com", "bob", "DEF456")

    def test_search_found(self):
        response = self.client.get(
            f"{SEARCH_URL}?q=bob%23DEF456", **_auth_header(self.alice)
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data["user"])
        self.assertEqual(response.data["user"]["identify_tag"], "bob#DEF456")

    def test_search_normalizes_query(self):
        response = self.client.get(
            f"{SEARCH_URL}?q=%20BoB%20%23%20def456%20",
            **_auth_header(self.alice),
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data["user"])
        self.assertEqual(response.data["user"]["identify_tag"], "bob#DEF456")

    def test_search_not_found_returns_null(self):
        response = self.client.get(
            f"{SEARCH_URL}?q=nobody%23ZZZ999", **_auth_header(self.alice)
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["user"])

    def test_search_malformed_query_no_hash_400(self):
        response = self.client.get(
            f"{SEARCH_URL}?q=invalidquery", **_auth_header(self.alice)
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error_code"], "INVALID_SEARCH_QUERY")

    def test_search_malformed_short_name_400(self):
        """name part too short (< 3 chars) should return 400, not 200 null."""
        response = self.client.get(
            f"{SEARCH_URL}?q=ab%23ABC123", **_auth_header(self.alice)
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error_code"], "INVALID_SEARCH_QUERY")

    def test_search_malformed_short_code_400(self):
        """code part too short should return 400, not 200 null."""
        response = self.client.get(
            f"{SEARCH_URL}?q=name%2312", **_auth_header(self.alice)
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error_code"], "INVALID_SEARCH_QUERY")


class AuthPermissionTests(APITestCase):

    def test_requires_auth_401(self):
        response = self.client.get(FRIEND_LIST_URL)
        self.assertEqual(response.status_code, 401)

    def test_requires_profile_completed_403(self):
        user = User.objects.create_user(
            email="unfinished@example.com", password="testpass123!"
        )
        user.email_verified = True
        user.email_verified_at = timezone.now()
        user.save()

        response = self.client.get(FRIEND_LIST_URL, **_auth_header(user))
        self.assertEqual(response.status_code, 403)
        self.assertIn("Complete verification", response.data["detail"])
