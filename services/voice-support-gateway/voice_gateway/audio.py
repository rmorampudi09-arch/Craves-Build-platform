"""Exotel wants outbound PCM in 320-byte multiples of at least 3,200 bytes (100 ms at 16 kHz, 16-bit mono)."""

from __future__ import annotations

CHUNK_BYTES = 3200  # 100 ms at 16 kHz: small, so Exotel's "clear" leaves little already-queued audio on a barge-in.


class Chunker:
    """Collects model audio and hands out Exotel-sized chunks; flush() pads the tail with silence."""

    def __init__(self, chunk_bytes: int = CHUNK_BYTES) -> None:
        if chunk_bytes < 3200 or chunk_bytes % 320:
            raise ValueError("chunk must be a multiple of 320 bytes and at least 3200")
        self.chunk_bytes = chunk_bytes
        self._pending = bytearray()

    def push(self, pcm: bytes) -> list[bytes]:
        self._pending += pcm
        chunks = []
        while len(self._pending) >= self.chunk_bytes:
            chunks.append(bytes(self._pending[: self.chunk_bytes]))
            del self._pending[: self.chunk_bytes]
        return chunks

    def flush(self) -> list[bytes]:
        if not self._pending:
            return []
        tail = bytes(self._pending) + b"\x00" * (self.chunk_bytes - len(self._pending))
        self._pending.clear()
        return [tail]

    def drop(self) -> None:
        self._pending.clear()
