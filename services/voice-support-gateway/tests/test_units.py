from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
import pytest

from voice_gateway.audio import Chunker
from voice_gateway.backend import Backend
from voice_gateway.prompt import GUIDE, INSTRUCTIONS, build_instructions, greeting_prompt


def test_chunker_hands_out_exotel_sized_pieces_and_pads_the_tail():
    chunker = Chunker()
    assert chunker.push(b"a" * 3000) == []
    assert chunker.push(b"b" * 3400) == [b"a" * 3000 + b"b" * 200, b"b" * 3200]
    assert chunker.push(b"c" * 6500) == [b"c" * 3200, b"c" * 3200]
    assert chunker.flush() == [b"c" * 100 + b"\x00" * 3100]
    assert chunker.flush() == []
    chunker.push(b"d" * 10)
    chunker.drop()
    assert chunker.flush() == []
    tail = Chunker().push(b"e" * 100)
    assert tail == []
    with pytest.raises(ValueError):
        Chunker(3000)


def test_instructions_describe_the_caller_without_leaking_more_than_the_records_gave():
    now = datetime(2026, 10, 28, 19, 5, tzinfo=ZoneInfo("Asia/Kolkata"))
    customer = build_instructions({"caller": {"firstName": "Lakshmi", "role": "CUSTOMER"},
                                   "orders": [{"kitchenName": "Amma's Kitchen", "status": "OUT_FOR_DELIVERY"}]}, False, now)
    assert customer.startswith(INSTRUCTIONS.rstrip())
    assert "Wednesday 28 October 2026, 07:05 PM India time" in customer
    assert "Craves customer, Lakshmi" in customer and "OUT_FOR_DELIVERY" in customer

    chef = build_instructions({"caller": {"firstName": "Padma", "role": "CHEF", "applicationStatus": "PENDING",
                                          "reviewStatus": "MORE_INFORMATION_REQUIRED"}, "orders": []}, False, now)
    assert "home chef on Craves, Padma" in chef and "asked for more information" in chef

    unknown = build_instructions({"caller": None, "orders": []}, False, now)
    assert "not registered with Craves" in unknown
    down = build_instructions(None, True, now)
    assert "could not be reached" in down
    assert greeting_prompt({"caller": {"firstName": "Lakshmi"}}).endswith("greet them by name. Then wait.)")
    assert "greet them by name" not in greeting_prompt(None)
    if GUIDE:
        assert "Hyderabad" in customer


@pytest.mark.asyncio
async def test_backend_turns_failures_into_words_for_the_model():
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/context"):
            raise httpx.ConnectError("down")
        return httpx.Response(429, headers={"Retry-After": "60"})

    backend = Backend("https://backend.test", "s", httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert await backend.context("9876543210") is None
    result = await backend.open_ticket("9876543210", "x", "y", None, "Hindi")
    assert "too many tickets" in result["error"]
    await backend.aclose()
