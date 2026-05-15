from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import override_settings
from rest_framework.test import APITestCase


class PublicMediaFileTests(APITestCase):
    def setUp(self):
        self.tempdir = TemporaryDirectory()
        self.override = override_settings(MEDIA_ROOT=self.tempdir.name, DEBUG=False)
        self.override.enable()

    def tearDown(self):
        self.override.disable()
        self.tempdir.cleanup()

    def write_media_file(self, relative_path: str, content: bytes = b"image-bytes") -> None:
        path = Path(self.tempdir.name) / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def test_serves_avatar_when_debug_false(self):
        self.write_media_file("avatars/2026/05/avatar.webp", b"avatar-webp")

        response = self.client.get("/api/media/files/avatars/2026/05/avatar.webp")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"avatar-webp")
        self.assertEqual(response["Content-Type"], "image/webp")
        self.assertEqual(
            response["Cache-Control"],
            "public, max-age=31536000, immutable",
        )

    def test_serves_trip_cover_when_debug_false(self):
        self.write_media_file("trip-covers/cover.jpg", b"cover-jpg")

        response = self.client.get("/api/media/files/trip-covers/cover.jpg")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"cover-jpg")
        self.assertEqual(response["Content-Type"], "image/jpeg")

    def test_rejects_non_public_prefix(self):
        self.write_media_file("private/secret.webp", b"secret")

        response = self.client.get("/api/media/files/private/secret.webp")

        self.assertEqual(response.status_code, 404)

    def test_rejects_path_traversal(self):
        response = self.client.get("/api/media/files/avatars/../private/secret.webp")

        self.assertEqual(response.status_code, 404)

    def test_missing_file_returns_404(self):
        response = self.client.get("/api/media/files/avatars/missing.webp")

        self.assertEqual(response.status_code, 404)
