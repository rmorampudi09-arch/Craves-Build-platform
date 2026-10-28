"""One scripted call through the gateway: a fake Exotel on one side, a fake Voice Live and backend on the other."""

from __future__ import annotations

import asyncio
import base64
import json
import os

import httpx
import pytest
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from websockets.exceptions import InvalidStatus

from voice_gateway.app import Server
from voice_gateway.backend import Backend
from voice_gateway.config import Settings

PASSWORD = "exotel-secret"
PHONE = "09876543210"


def settings(**overrides) -> Settings:
    values = dict(
        port=0, exotel_password=PASSWORD, exotel_account_sid="craves1", voice_live_endpoint="https://placeholder",
        voice_live_key="vl-key", voice_live_model="gpt-4.1", voice_live_api_version="2026-04-10",
        voice_live_turn_detection="server_vad", stt_model="azure-speech", stt_languages="en-IN,hi-IN,te-IN,kn-IN",
        backend_base_url="https://backend.test", internal_secret="shared-secret", max_concurrent_calls=2,
        max_call_seconds=600,
    )
    values.update(overrides)
    return Settings(**values)


class FakeVoiceLive:
    """Plays one scripted scene per response.create: ("audio", pcm bytes) or ("tool", name, arguments)."""

    def __init__(self, scenes):
        self.scenes = list(scenes)
        self.received: list[dict] = []
        self.headers = {}
        self.query = ""
        self.server = None
        self.counter = 0

    async def __aenter__(self):
        self.server = await serve(self.handle, "127.0.0.1", 0, process_request=self.capture)
        return self

    async def __aexit__(self, *exc):
        self.server.close()
        await self.server.wait_closed()

    @property
    def endpoint(self) -> str:
        port = self.server.sockets[0].getsockname()[1]
        return f"http://127.0.0.1:{port}"

    async def capture(self, connection, request):
        self.headers = dict(request.headers)
        self.query = request.path
        return None

    async def handle(self, ws):
        async for raw in ws:
            message = json.loads(raw)
            self.received.append(message)
            if message["type"] == "session.update":
                await ws.send(json.dumps({"type": "session.updated", "session": {}}))
            elif message["type"] == "response.create":
                await self.play_next(ws)
            elif message["type"] == "input_audio_buffer.append" and message["audio"] == base64.b64encode(b"TALK").decode():
                # The test marks one media frame as "the caller said something": VAD start, VAD stop, then the model
                # answers by itself, as server_vad does with create_response on.
                await ws.send(json.dumps({"type": "input_audio_buffer.speech_started", "audio_start_ms": 10}))
                await ws.send(json.dumps({"type": "input_audio_buffer.speech_stopped", "audio_end_ms": 900}))
                await self.play_next(ws)

    async def play_next(self, ws):
        if not self.scenes:
            return
        scene = self.scenes.pop(0)
        self.counter += 1
        rid = f"resp_{self.counter}"
        await ws.send(json.dumps({"type": "response.created", "response": {"id": rid}}))
        if scene[0] == "audio":
            await ws.send(json.dumps({"type": "response.audio.delta", "response_id": rid,
                                      "delta": base64.b64encode(scene[1]).decode()}))
            await ws.send(json.dumps({"type": "response.audio.done", "response_id": rid}))
        elif scene[0] == "audio_split":
            # Two deltas with a pause between them, so the test can interrupt in the middle.
            async def rest():
                await asyncio.sleep(0.3)
                await ws.send(json.dumps({"type": "response.audio.delta", "response_id": rid,
                                          "delta": base64.b64encode(scene[2]).decode()}))
                await ws.send(json.dumps({"type": "response.audio.done", "response_id": rid}))
                await ws.send(json.dumps({"type": "response.done", "response": {"id": rid, "usage": {}}}))
            await ws.send(json.dumps({"type": "response.audio.delta", "response_id": rid,
                                      "delta": base64.b64encode(scene[1]).decode()}))
            asyncio.get_running_loop().create_task(rest())
            return
        else:
            call = {"type": "function_call", "call_id": f"call_{self.counter}", "name": scene[1], "arguments": scene[2]}
            await ws.send(json.dumps({"type": "response.output_item.added", "response_id": rid, "item": call}))
            await ws.send(json.dumps({"type": "response.function_call_arguments.done", "response_id": rid,
                                      "call_id": call["call_id"], "arguments": scene[2]}))
            await ws.send(json.dumps({"type": "response.output_item.done", "response_id": rid, "item": call}))
        await ws.send(json.dumps({"type": "response.done", "response": {
            "id": rid, "usage": {"input_tokens": 100, "output_tokens": 20,
                                 "input_token_details": {"audio_tokens": 60},
                                 "output_token_details": {"audio_tokens": 15}}}}))


def fake_backend(calls: list) -> Backend:
    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.headers["X-Craves-Internal-Secret"] == "shared-secret"
        if request.url.path.endswith("/context"):
            return httpx.Response(200, json={"caller": {"firstName": "Lakshmi", "role": "CUSTOMER"},
                                             "orders": [{"kitchenName": "Amma's Kitchen", "status": "PREPARING"}]})
        if request.url.path.endswith("/tickets"):
            return httpx.Response(200, json={"id": "x", "caseNumber": "CRV-ABCDEF123456"})
        return httpx.Response(404)

    return Backend("https://backend.test", "shared-secret", httpx.AsyncClient(transport=httpx.MockTransport(handler)))


class GatewayUnderTest:
    def __init__(self, voice_live_endpoint: str, backend: Backend, **overrides):
        self.server_obj = Server(settings(voice_live_endpoint=voice_live_endpoint, **overrides), backend)
        self.server = None

    async def __aenter__(self):
        self.server = await serve(self.server_obj.handle, "127.0.0.1", 0, process_request=self.server_obj.process_request)
        return self

    async def __aexit__(self, *exc):
        self.server.close()
        await self.server.wait_closed()

    @property
    def port(self) -> int:
        return self.server.sockets[0].getsockname()[1]

    def url(self, auth: bool = True) -> str:
        cred = f"craves:{PASSWORD}@" if auth else ""
        return f"ws://{cred}127.0.0.1:{self.port}/exotel/voice?sample-rate=16000"


def start_event(sample_rate: str = "16000", account: str = "craves1") -> str:
    return json.dumps({"event": "start", "sequence_number": "1", "stream_sid": "stream1", "start": {
        "stream_sid": "stream1", "call_sid": "call1", "account_sid": account, "from": PHONE, "to": "04012345678",
        "custom_parameters": {}, "media_format": {"encoding": "audio/x-raw", "sample_rate": sample_rate, "bit_rate": "16"}}})


def media(payload: bytes) -> str:
    return json.dumps({"event": "media", "sequence_number": "2", "stream_sid": "stream1",
                       "media": {"chunk": "1", "timestamp": "100", "payload": base64.b64encode(payload).decode()}})


async def collect(ws, until, timeout=5.0) -> list[dict]:
    """Reads gateway->Exotel messages until `until(messages)` is true."""
    messages: list[dict] = []

    async def read():
        while True:
            messages.append(json.loads(await ws.recv()))
            if until(messages):
                return
    await asyncio.wait_for(read(), timeout)
    return messages


@pytest.mark.asyncio
async def test_a_whole_call_from_greeting_to_hangup():
    scenes = [
        ("audio", b"\x01\x02" * 2500),             # greeting: 5000 bytes -> one 3200 chunk + a padded tail
        ("tool", "set_language", '{"language": "te"}'),
        ("audio", b"\x03\x04" * 1600),             # answer in Telugu: exactly one chunk
        ("tool", "open_support_ticket", json.dumps({"subject": "Refund not received", "details": "Order from Amma's Kitchen, refund pending", "caller_name": "Lakshmi"})),
        ("audio", b"\x05\x06" * 1600),             # confirms the ticket
        ("tool", "end_call", "{}"),
        ("audio", b"\x07\x08" * 1600),             # goodbye
    ]
    backend_calls: list[httpx.Request] = []
    async with FakeVoiceLive(scenes) as voice_live, GatewayUnderTest(voice_live.endpoint, fake_backend(backend_calls)) as gateway:
        async with connect(gateway.url()) as exotel:
            await exotel.send(json.dumps({"event": "connected"}))
            await exotel.send(start_event())

            # 1. Greeting: two media chunks (3200 bytes each, the second padded), then a mark.
            out = await collect(exotel, lambda m: any(x["event"] == "mark" for x in m))
            chunks = [base64.b64decode(x["media"]["payload"]) for x in out if x["event"] == "media"]
            assert [len(c) for c in chunks] == [3200, 3200]
            assert chunks[0] == b"\x01\x02" * 1600
            assert chunks[1] == b"\x01\x02" * 900 + b"\x00" * 1400
            assert out[-1] == {"event": "mark", "stream_sid": "stream1", "mark": {"name": "audio:resp_1"}}

            # 2. The caller speaks (Telugu): the frame is forwarded as-is, the speech start clears Exotel's queue,
            #    the model calls set_language, the voice changes, the tool result goes back and the answer plays.
            await exotel.send(media(b"TALK"))
            out = await collect(exotel, lambda m: any(x["event"] == "mark" and x["mark"]["name"] == "audio:resp_3" for x in m))
            assert out[0] == {"event": "clear", "stream_sid": "stream1"}
            assert [len(base64.b64decode(x["media"]["payload"])) for x in out if x["event"] == "media"] == [3200]

            # 3. Next turn: the model opens a ticket (backend call), then confirms it.
            await exotel.send(media(b"TALK"))
            out = await collect(exotel, lambda m: any(x["event"] == "mark" and x["mark"]["name"] == "audio:resp_5" for x in m))
            assert any(x["event"] == "media" for x in out)

            # 4. Last turn: end_call, then the goodbye; the gateway hangs up once Exotel confirms it played.
            await exotel.send(media(b"TALK"))
            out = await collect(exotel, lambda m: any(x["event"] == "mark" and x["mark"]["name"] == "audio:resp_7" for x in m))
            await exotel.send(json.dumps({"event": "mark", "sequence_number": "9", "stream_sid": "stream1", "mark": {"name": "audio:resp_7"}}))
            with pytest.raises(Exception):
                await asyncio.wait_for(exotel.recv(), 5)

    sent = voice_live.received
    session = next(m for m in sent if m["type"] == "session.update")["session"]
    assert session["input_audio_sampling_rate"] == 16000
    assert session["output_audio_format"] == "pcm16_16000hz"
    assert session["input_audio_transcription"] == {"model": "azure-speech", "language": "en-IN,hi-IN,te-IN,kn-IN"}
    assert session["voice"] == {"type": "azure-standard", "name": "en-IN-NeerjaNeural", "rate": "1.0"}
    assert [t["name"] for t in session["tools"]] == ["set_language", "refresh_orders", "open_support_ticket", "end_call"]
    assert "Lakshmi" in session["instructions"] and "Amma's Kitchen" in session["instructions"]
    assert voice_live.headers.get("api-key") == "vl-key"
    assert "api-version=2026-04-10" in voice_live.query and "model=gpt-4.1" in voice_live.query

    appended = [m for m in sent if m["type"] == "input_audio_buffer.append"]
    assert len(appended) == 3 and appended[0]["audio"] == base64.b64encode(b"TALK").decode()

    voice_updates = [m["session"]["voice"]["name"] for m in sent if m["type"] == "session.update" and set(m["session"]) == {"voice"}]
    assert voice_updates == ["te-IN-ShrutiNeural"]

    outputs = [json.loads(m["item"]["output"]) for m in sent if m["type"] == "conversation.item.create" and m["item"]["type"] == "function_call_output"]
    assert len(outputs) == 3, "each tool call is answered exactly once"
    assert outputs[0] == {"ok": True, "language": "Telugu"}
    assert outputs[1]["caseNumber"] == "CRV-ABCDEF123456"
    assert outputs[2]["ok"] is True

    # Tool results are sent only after the calling response finished, each followed by exactly one response.create.
    kinds = [m["type"] for m in sent]
    first_output = kinds.index("conversation.item.create", kinds.index("conversation.item.create") + 1)
    assert kinds[first_output + 1] == "response.create"

    ticket = next(r for r in backend_calls if r.url.path.endswith("/tickets"))
    body = json.loads(ticket.content)
    assert body == {"phone": PHONE, "subject": "Refund not received", "details": "Order from Amma's Kitchen, refund pending",
                    "callerName": "Lakshmi", "language": "Telugu"}
    assert backend_calls[0].url.params["phone"] == PHONE


@pytest.mark.asyncio
async def test_wrong_password_other_sample_rate_and_health():
    async with FakeVoiceLive([]) as voice_live, GatewayUnderTest(voice_live.endpoint, fake_backend([])) as gateway:
        with pytest.raises(InvalidStatus) as refused:
            async with connect(gateway.url(auth=False)):
                pass
        assert refused.value.response.status_code == 401

        async with connect(gateway.url()) as exotel:
            await exotel.send(start_event(sample_rate="8000"))
            with pytest.raises(Exception):
                await asyncio.wait_for(exotel.recv(), 5)  # closed without a session
        assert not any(m["type"] == "session.update" for m in voice_live.received)

        async with connect(gateway.url()) as exotel:
            await exotel.send(start_event(account="someone-else"))
            with pytest.raises(Exception):
                await asyncio.wait_for(exotel.recv(), 5)

        async with httpx.AsyncClient() as http:
            health = await http.get(f"http://127.0.0.1:{gateway.port}/healthz")
            assert health.status_code == 200 and health.text.strip() == "ok"
            assert (await http.get(f"http://127.0.0.1:{gateway.port}/nope")).status_code == 404


@pytest.mark.asyncio
async def test_unconfigured_gateway_reports_what_is_missing():
    broken = Server(settings(voice_live_key="", exotel_password=""), fake_backend([]))
    async with serve(broken.handle, "127.0.0.1", 0, process_request=broken.process_request) as server:
        port = server.sockets[0].getsockname()[1]
        async with httpx.AsyncClient() as http:
            health = await http.get(f"http://127.0.0.1:{port}/healthz")
    assert health.status_code == 503
    assert "EXOTEL_STREAM_PASSWORD" in health.text and "VOICE_LIVE_API_KEY" in health.text


def test_settings_read_the_environment(monkeypatch):
    for name in ("EXOTEL_STREAM_PASSWORD", "VOICE_LIVE_ENDPOINT", "VOICE_LIVE_API_KEY", "CRAVES_SUPPORT_BACKEND_BASE_URL",
                 "CRAVES_INTERNAL_SERVICE_SECRET"):
        monkeypatch.setenv(name, "x")
    monkeypatch.setenv("VOICE_TE", "te-IN-MohanNeural")
    monkeypatch.setenv("MAX_CALL_SECONDS", "900")
    loaded = Settings.from_env()
    assert loaded.missing() == []
    assert loaded.voices["te"] == "te-IN-MohanNeural" and loaded.voices["hi"] == "hi-IN-SwaraNeural"
    assert loaded.max_call_seconds == 900 and loaded.voice_live_model == "gpt-4.1"
    assert os.environ.get("PORT") is None or loaded.port == int(os.environ["PORT"])


@pytest.mark.asyncio
async def test_barge_in_stops_the_model_and_drops_its_remaining_audio():
    scenes = [("audio_split", b"\x01" * 3200, b"\x02" * 3200)]
    async with FakeVoiceLive(scenes) as voice_live, GatewayUnderTest(voice_live.endpoint, fake_backend([])) as gateway:
        async with connect(gateway.url()) as exotel:
            await exotel.send(start_event())
            first = await collect(exotel, lambda m: any(x["event"] == "media" for x in m))
            assert base64.b64decode(first[-1]["media"]["payload"]) == b"\x01" * 3200
            await exotel.send(media(b"TALK"))  # the caller talks over the greeting
            out = await collect(exotel, lambda m: any(x["event"] == "mark" for x in m))
            assert out[0] == {"event": "clear", "stream_sid": "stream1"}
            assert not any(x["event"] == "media" for x in out), "audio of the interrupted response must not play"
            await exotel.send(json.dumps({"event": "stop", "stream_sid": "stream1", "stop": {"reason": "callended"}}))
            with pytest.raises(Exception):
                await asyncio.wait_for(exotel.recv(), 5)
    session = next(m for m in voice_live.received if m["type"] == "session.update")["session"]
    assert session["turn_detection"]["interrupt_response"] is True  # Voice Live stops the model; we only drop audio
