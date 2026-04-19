from __future__ import annotations

import io

from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from test_helpers import create_completed_user

UPLOAD_URL = "/api/media/trip-covers"


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _fake_image(content_type: str = "image/jpeg", size_bytes: int = 1024) -> io.BytesIO:
    """Return a tiny valid JPEG-like buffer (not a real image, just enough bytes)."""
    buf = io.BytesIO(b"\xff\xd8\xff" + b"\x00" * (size_bytes - 3))
    buf.name = "cover.jpg"
    buf.content_type = content_type
    return buf


@override_settings(MEDIA_ROOT="/tmp/goplan_test_media")
class TripCoverUploadTests(APITestCase):

    def setUp(self):
        self.user = create_completed_user("uploader@example.com", "uploader", "UPL001")

    def test_upload_jpeg_201(self):
        buf = _fake_image("image/jpeg")
        res = self.client.post(
            UPLOAD_URL,
            {"file": buf},
            format="multipart",
            **_auth(self.user),
        )
        self.assertEqual(res.status_code, 201)
        self.assertIn("url", res.data)
        self.assertTrue(res.data["url"].startswith("/media/trip-covers/"))
        self.assertTrue(res.data["url"].endswith(".jpg"))

    def test_upload_requires_auth_401(self):
        buf = _fake_image()
        res = self.client.post(UPLOAD_URL, {"file": buf}, format="multipart")
        self.assertEqual(res.status_code, 401)

    def test_upload_no_file_400(self):
        res = self.client.post(UPLOAD_URL, {}, format="multipart", **_auth(self.user))
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error_code"], "NO_FILE")

    def test_upload_wrong_content_type_400(self):
        """A file with non-image bytes must be rejected even if header claims it's JPEG."""
        from django.core.files.uploadedfile import InMemoryUploadedFile
        import io as _io

        # Plain text bytes — definitely not an image
        fake_bytes = _io.BytesIO(b"<script>alert('xss')</script>")
        fake_file = InMemoryUploadedFile(
            file=fake_bytes,
            field_name="file",
            name="evil.jpg",
            content_type="image/jpeg",    # lies — claims to be JPEG
            size=len(b"<script>alert('xss')</script>"),
            charset=None,
        )
        res = self.client.post(
            UPLOAD_URL,
            {"file": fake_file},
            format="multipart",
            **_auth(self.user),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error_code"], "INVALID_TYPE")

    def test_upload_too_large_400(self):
        buf = _fake_image(size_bytes=6 * 1024 * 1024)  # 6 MB
        res = self.client.post(
            UPLOAD_URL,
            {"file": buf},
            format="multipart",
            **_auth(self.user),
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error_code"], "FILE_TOO_LARGE")
