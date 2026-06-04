from __future__ import annotations

import zipfile
from collections.abc import Iterable, Iterator

STREAM_CHUNK_SIZE = 1024 * 1024


class _ZipStreamBuffer:
    """A minimal non-seekable sink for streaming ZIP output.

    ``zipfile.ZipFile`` only buffers the whole archive when its target supports
    ``seek``/``tell``. By exposing neither, the writer falls back to streaming
    (data-descriptor) mode, so the archive is emitted incrementally and memory
    stays flat regardless of how many photos are included.
    """

    def __init__(self) -> None:
        self._buffer = bytearray()

    def write(self, data: bytes) -> int:
        self._buffer.extend(data)
        return len(data)

    def flush(self) -> None:  # pragma: no cover - required by the ZipFile API
        pass

    def take(self) -> bytes:
        data = bytes(self._buffer)
        self._buffer.clear()
        return data


def iter_trip_photos_zip(entries: Iterable[tuple[str, object]]) -> Iterator[bytes]:
    """Yield the bytes of a ZIP archive built from ``(name, file_field)`` pairs.

    Photos are stored uncompressed (``ZIP_STORED``) because they are already
    WebP-compressed, and each source file is read in bounded chunks so peak
    memory does not grow with the archive size.
    """
    buffer = _ZipStreamBuffer()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_STORED) as archive:
        for name, field in entries:
            with (
                archive.open(zipfile.ZipInfo(name), mode="w") as dest,
                field.storage.open(field.name, "rb") as source,
            ):
                while True:
                    chunk = source.read(STREAM_CHUNK_SIZE)
                    if not chunk:
                        break
                    dest.write(chunk)
                    data = buffer.take()
                    if data:
                        yield data
            data = buffer.take()
            if data:
                yield data
    remaining = buffer.take()
    if remaining:
        yield remaining
