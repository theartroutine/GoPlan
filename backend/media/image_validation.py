from __future__ import annotations

from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError

ALLOWED_WEB_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
FORMAT_CONTENT_TYPES = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}
CONTENT_TYPE_FORMATS = {value: key for key, value in FORMAT_CONTENT_TYPES.items()}
IMAGE_PARSE_ERRORS = (
    UnidentifiedImageError,
    OSError,
    ValueError,
    SyntaxError,
    Image.DecompressionBombError,
)
HEIC_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1"}


class ImageValidationError(Exception):
    def __init__(self, error_code: str, detail: str) -> None:
        self.error_code = error_code
        self.detail = detail
        super().__init__(detail)


@dataclass(frozen=True)
class ImageProbeResult:
    image_format: str
    content_type: str
    width: int
    height: int
    mode: str
    has_transparency: bool


def _is_heic_header(header: bytes) -> bool:
    if len(header) < 12 or header[4:8] != b"ftyp":
        return False
    brands = {header[8:12]}
    brands.update(header[index:index + 4] for index in range(16, min(len(header), 64), 4))
    return any(brand in HEIC_BRANDS for brand in brands)


def detect_image_format_from_header(header: bytes) -> str:
    stripped = header.lstrip().lower()
    if stripped.startswith(b"<svg") or b"<svg" in stripped[:128]:
        raise ImageValidationError(
            "UNSUPPORTED_IMAGE_TYPE",
            "SVG images are not supported. Use JPEG, PNG, or WebP.",
        )
    if _is_heic_header(header):
        raise ImageValidationError(
            "HEIC_UNSUPPORTED",
            "HEIC images are not supported yet. Please convert to JPEG, PNG, or WebP.",
        )
    if header.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "WEBP"
    raise ImageValidationError(
        "UNSUPPORTED_IMAGE_TYPE",
        "Unsupported image format. Use JPEG, PNG, or WebP.",
    )


def detect_image_content_type_from_header(header: bytes) -> str | None:
    try:
        image_format = detect_image_format_from_header(header)
    except ImageValidationError:
        return None
    return FORMAT_CONTENT_TYPES.get(image_format)


def validate_pillow_image(
    image_file,
    *,
    expected_format: str,
    allowed_formats: set[str],
    max_source_pixels: int,
    reject_animated: bool = True,
) -> ImageProbeResult:
    image_file.seek(0)
    try:
        with Image.open(image_file) as probe:
            image_format = probe.format or ""
            if image_format != expected_format or image_format not in allowed_formats:
                raise ImageValidationError(
                    "UNSUPPORTED_IMAGE_TYPE",
                    "Unsupported image format. Use JPEG, PNG, or WebP.",
                )
            if reject_animated and getattr(probe, "is_animated", False):
                raise ImageValidationError(
                    "PHOTO_INVALID_IMAGE",
                    "Animated images are not supported.",
                )
            if probe.width * probe.height > max_source_pixels:
                raise ImageValidationError(
                    "PHOTO_DIMENSIONS_TOO_LARGE",
                    "Photo dimensions are too large.",
                )
            result = ImageProbeResult(
                image_format=image_format,
                content_type=FORMAT_CONTENT_TYPES[image_format],
                width=probe.width,
                height=probe.height,
                mode=probe.mode,
                has_transparency="transparency" in probe.info,
            )
            probe.verify()
            return result
    except ImageValidationError:
        raise
    except IMAGE_PARSE_ERRORS as exc:
        raise ImageValidationError(
            "PHOTO_INVALID_IMAGE",
            "Photo could not be parsed safely.",
        ) from exc
    finally:
        image_file.seek(0)
