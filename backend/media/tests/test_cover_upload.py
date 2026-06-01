from __future__ import annotations

import io

from django.test import override_settings
from rest_framework.test import APITestCase
from PIL import Image

from accounts.tokens import AccessToken
from test_helpers import create_completed_user

UPLOAD_URL = "/api/media/trip-covers"


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def _fake_image(
    content_type: str = "image/jpeg",
    size_bytes: int | None = None,
    dimensions: tuple[int, int] = (16, 16),
) -> io.BytesIO:
    """Return a tiny valid JPEG buffer."""
    buf = io.BytesIO()
    Image.new("RGB", dimensions, color="navy").save(buf, format="JPEG")
    if size_bytes is not None:
        content = buf.getvalue()
        buf = io.BytesIO(content + (b"\x00" * max(size_bytes - len(content), 0)))
    buf.seek(0)
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

        # Plain text bytes — definitely not an image
        fake_content = b"<script>alert('xss')</script>"
        fake_bytes = io.BytesIO(fake_content)
        fake_file = InMemoryUploadedFile(
            file=fake_bytes,
            field_name="file",
            name="evil.jpg",
            content_type="image/jpeg",    # lies — claims to be JPEG
            size=len(fake_content),
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

    def test_upload_rejects_malformed_image_with_valid_magic_bytes(self):
        from django.core.files.uploadedfile import InMemoryUploadedFile

        fake_content = b"\xff\xd8\xff" + b"not a real jpeg"
        fake_file = InMemoryUploadedFile(
            file=io.BytesIO(fake_content),
            field_name="file",
            name="broken.jpg",
            content_type="image/jpeg",
            size=len(fake_content),
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

    @override_settings(UPLOAD_MAX_SOURCE_PIXELS=100)
    def test_upload_rejects_oversized_source_pixels(self):
        buf = _fake_image(dimensions=(11, 10))
        res = self.client.post(
            UPLOAD_URL,
            {"file": buf},
            format="multipart",
            **_auth(self.user),
        )

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error_code"], "INVALID_TYPE")
