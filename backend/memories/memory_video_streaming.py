from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterator
from dataclasses import dataclass

from django.http import FileResponse, HttpResponse, StreamingHttpResponse

RANGE_PATTERN = re.compile(r"^bytes=(\d*)-(\d*)$")
MAX_RANGE_COMPONENT_DIGITS = 20
STREAM_CHUNK_SIZE = 1024 * 1024


@dataclass(frozen=True)
class ParsedByteRange:
    start: int
    end: int

    @property
    def length(self) -> int:
        return self.end - self.start + 1


def safe_mp4_filename(title: str) -> str:
    ascii_title = (
        unicodedata.normalize("NFKD", title or "")
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", ascii_title).strip("._-")
    if not stem:
        stem = "memory-video"
    if not stem.lower().endswith(".mp4"):
        stem = f"{stem}.mp4"
    return stem


def _parse_range_int(value: str) -> int | None:
    if len(value) > MAX_RANGE_COMPONENT_DIGITS:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def parse_range_header(range_header: str, size: int) -> ParsedByteRange | None:
    if size <= 0:
        return None

    match = RANGE_PATTERN.match(range_header.strip())
    if not match:
        return None

    raw_start, raw_end = match.groups()
    if raw_start == "" and raw_end == "":
        return None

    if raw_start == "":
        suffix_length = _parse_range_int(raw_end)
        if suffix_length is None:
            return None
        if suffix_length <= 0:
            return None
        start = max(size - suffix_length, 0)
        end = size - 1
        return ParsedByteRange(start=start, end=end)

    start = _parse_range_int(raw_start)
    if start is None:
        return None
    if start >= size:
        return None

    if raw_end == "":
        end = size - 1
    else:
        parsed_end = _parse_range_int(raw_end)
        if parsed_end is None:
            return None
        end = min(parsed_end, size - 1)
        if end < start:
            return None

    return ParsedByteRange(start=start, end=end)


def _range_file_iterator(storage, name: str, byte_range: ParsedByteRange) -> Iterator[bytes]:
    with storage.open(name, "rb") as file_obj:
        file_obj.seek(byte_range.start)
        remaining = byte_range.length
        while remaining > 0:
            chunk = file_obj.read(min(STREAM_CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def _set_common_headers(
    response: HttpResponse,
    *,
    content_type: str,
    content_disposition: str,
) -> HttpResponse:
    response.headers["Accept-Ranges"] = "bytes"
    response.headers["Content-Type"] = content_type
    response.headers["Content-Disposition"] = content_disposition
    return response


def range_streaming_response(
    *,
    field,
    range_header: str | None,
    content_type: str,
    content_disposition: str,
) -> HttpResponse:
    size = field.size

    if not range_header:
        response = FileResponse(
            field.storage.open(field.name, "rb"),
            content_type=content_type,
        )
        response.headers["Content-Length"] = str(size)
        return _set_common_headers(
            response,
            content_type=content_type,
            content_disposition=content_disposition,
        )

    parsed_range = parse_range_header(range_header, size)
    if parsed_range is None:
        response = HttpResponse(status=416)
        response.headers["Accept-Ranges"] = "bytes"
        response.headers["Content-Range"] = f"bytes */{size}"
        response.headers["Content-Length"] = "0"
        return response

    response = StreamingHttpResponse(
        _range_file_iterator(field.storage, field.name, parsed_range),
        status=206,
        content_type=content_type,
    )
    response.headers["Content-Range"] = (
        f"bytes {parsed_range.start}-{parsed_range.end}/{size}"
    )
    response.headers["Content-Length"] = str(parsed_range.length)
    return _set_common_headers(
        response,
        content_type=content_type,
        content_disposition=content_disposition,
    )
