"""Bridges one Exotel AgentStream call (wss from Exotel) to one Azure Voice Live session (wss to Foundry).

Audio goes through untouched: Exotel streams 16 kHz PCM16 base64 in, Voice Live answers 16 kHz PCM16 base64 out.
The model decides what to say; this file only moves bytes, runs the four tools, and ends the call.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import hmac
import json
import logging
import re
import time
import uuid
from http import HTTPStatus
from typing import Any

from websockets.asyncio.client import connect
from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed

from .audio import Chunker
from .backend import Backend
from .config import LANGUAGES, Settings
from .prompt import TOOLS, build_instructions, greeting_prompt, language_name

log = logging.getLogger("voice")

START_TIMEOUT_SECONDS = 10
GOODBYE_GRACE_SECONDS = 15
WRAP_UP_BEFORE_END_SECONDS = 30


class CallSession:
    def __init__(self, settings: Settings, backend: Backend, exotel: ServerConnection, call_id: str) -> None:
        self.settings = settings
        self.backend = backend
        self.exotel = exotel
        self.call_id = call_id
        self.stream_sid = ""
        self.phone = ""
        self.language = "en"
        self.chunker = Chunker()
        self.voice_live: Any = None
        self.active_response: str | None = None
        self.interrupted_response: str | None = None  # audio still arriving for a response the caller talked over
        self.pending_outputs: list[dict[str, Any]] = []
        self.call_names: dict[str, str] = {}  # call_id -> function name, from response.output_item.added
        self.calls_run: set[str] = set()
        self.ending = False  # end_call was called; the next response is the goodbye
        self.await_goodbye = False
        self.ending_response: str | None = None
        self.final_mark: str | None = None
        self.ticket_opened = False
        self.wrap_up_asked = False
        self.context: dict[str, Any] | None = None
        self.lookups_down = False
        self.tool_names: list[str] = []
        self.usage = {"responses": 0, "input_tokens": 0, "output_tokens": 0, "audio_input_tokens": 0, "audio_output_tokens": 0}
        self.started = time.monotonic()
        self.closed = asyncio.Event()

    # ---- lifecycle -------------------------------------------------------------------------------------------

    async def run(self) -> None:
        try:
            start = await asyncio.wait_for(self._await_start(), START_TIMEOUT_SECONDS)
        except (asyncio.TimeoutError, ConnectionClosed):
            log.warning("call=%s no start event", self.call_id)
            return
        if start is None:
            return
        self.context = await self.backend.context(self.phone)
        self.lookups_down = self.context is None
        caller = (self.context or {}).get("caller")
        log.info("call=%s started caller=%s role=%s orders=%d", self.call_id,
                 "known" if caller else "unknown", (caller or {}).get("role", "-"), len((self.context or {}).get("orders") or []))
        uri = (re.sub(r"^http", "ws", self.settings.voice_live_endpoint)  # https -> wss (plain ws only in tests)
               + f"/voice-live/realtime?api-version={self.settings.voice_live_api_version}&model={self.settings.voice_live_model}")
        try:
            async with connect(uri, additional_headers={"api-key": self.settings.voice_live_key},
                               max_size=4 * 1024 * 1024, ping_interval=20, ping_timeout=20) as voice_live:
                self.voice_live = voice_live
                await self._send_vl(self._session_update(build_instructions(self.context, self.lookups_down)))
                tasks = [asyncio.create_task(self._pump_exotel()), asyncio.create_task(self._pump_voice_live()),
                         asyncio.create_task(self._watch_clock()), asyncio.create_task(self.closed.wait())]
                try:
                    await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                finally:
                    for task in tasks:
                        task.cancel()
                    for task in tasks:
                        try:
                            await task
                        except (asyncio.CancelledError, Exception):  # noqa: BLE001 - a dying pump must not mask the other
                            pass
        except Exception as error:  # noqa: BLE001 - whatever failed, the caller must not sit on a silent line
            log.error("call=%s voice live failed: %s", self.call_id, type(error).__name__)
        finally:
            seconds = int(time.monotonic() - self.started)
            log.info("call=%s ended seconds=%d responses=%d tokens_in=%d tokens_out=%d audio_in=%d audio_out=%d tools=%s ticket=%s",
                     self.call_id, seconds, self.usage["responses"], self.usage["input_tokens"], self.usage["output_tokens"],
                     self.usage["audio_input_tokens"], self.usage["audio_output_tokens"], ",".join(self.tool_names) or "-",
                     self.ticket_opened)
            await self._close_exotel()

    async def _await_start(self) -> dict[str, Any] | None:
        """Exotel sends connected, then start; nothing else matters before start."""
        async for raw in self.exotel:
            message = _json(raw)
            event = message.get("event")
            if event == "start":
                start = message.get("start") or {}
                self.stream_sid = str(message.get("stream_sid") or start.get("stream_sid") or "")
                self.phone = str(start.get("from") or "")
                sample_rate = str((start.get("media_format") or {}).get("sample_rate") or "")
                account = str(start.get("account_sid") or "")
                if self.settings.exotel_account_sid and account != self.settings.exotel_account_sid:
                    log.warning("call=%s start from another Exotel account; closing", self.call_id)
                    return None
                if sample_rate != "16000":
                    log.error("call=%s Exotel sample rate is %s, not 16000: add ?sample-rate=16000 to the applet URL", self.call_id, sample_rate)
                    return None
                return start
            if event == "stop":
                return None
        return None

    async def _watch_clock(self) -> None:
        limit = self.settings.max_call_seconds
        await asyncio.sleep(max(0, limit - WRAP_UP_BEFORE_END_SECONDS))
        self.wrap_up_asked = True
        if self.active_response is None and not self.ending:
            await self._say("(The call time limit is almost reached. Wrap up now: say a short goodbye and call end_call.)")
        await asyncio.sleep(WRAP_UP_BEFORE_END_SECONDS)
        log.info("call=%s hit the %ds limit", self.call_id, limit)

    # ---- Exotel -> Voice Live ------------------------------------------------------------------------------------

    async def _pump_exotel(self) -> None:
        async for raw in self.exotel:
            message = _json(raw)
            event = message.get("event")
            if event == "media":
                payload = (message.get("media") or {}).get("payload")
                if payload:
                    await self._send_vl({"type": "input_audio_buffer.append", "audio": payload})
            elif event == "mark":
                if self.final_mark and (message.get("mark") or {}).get("name") == self.final_mark:
                    return  # The goodbye has been played; hanging up ends the applet.
            elif event == "stop":
                return
            elif event == "dtmf":
                pass  # Keypad presses are not used; the caller just talks.

    # ---- Voice Live -> Exotel ------------------------------------------------------------------------------------

    async def _pump_voice_live(self) -> None:
        greeted = False
        async for raw in self.voice_live:
            event = _json(raw)
            kind = event.get("type")
            if kind == "session.updated":
                if not greeted:
                    greeted = True
                    await self._say(greeting_prompt(self.context))
            elif kind == "input_audio_buffer.speech_started":
                # Barge-in: Voice Live cancels the response itself (interrupt_response); drop what has not played yet
                # and ignore the audio of that response still in flight.
                self.chunker.drop()
                await self._send_exotel({"event": "clear", "stream_sid": self.stream_sid})
                if self.active_response:
                    self.interrupted_response = self.active_response
            elif kind == "response.created":
                self.active_response = (event.get("response") or {}).get("id")
                if self.await_goodbye:
                    self.await_goodbye = False
                    self.ending_response = self.active_response
            elif kind == "response.audio.delta":
                if event.get("response_id") == self.interrupted_response:
                    continue
                try:
                    pcm = base64.b64decode(event.get("delta") or "")
                except (binascii.Error, ValueError):
                    continue
                for chunk in self.chunker.push(pcm):
                    await self._send_media(chunk)
            elif kind == "response.audio.done":
                for chunk in self.chunker.flush():
                    await self._send_media(chunk)
                mark = f"audio:{event.get('response_id', '')}"
                await self._send_exotel({"event": "mark", "stream_sid": self.stream_sid, "mark": {"name": mark}})
                if self.ending_response and event.get("response_id") == self.ending_response:
                    # Hang up once Exotel reports the goodbye played, or after a grace period if it never does.
                    self.final_mark = mark
                    asyncio.get_running_loop().call_later(GOODBYE_GRACE_SECONDS, self.closed.set)
            elif kind == "response.output_item.added":
                item = event.get("item") or {}
                if item.get("type") == "function_call" and item.get("call_id"):
                    self.call_names[item["call_id"]] = item.get("name") or ""
            elif kind == "response.function_call_arguments.done":
                call_id = event.get("call_id") or ""
                await self._run_tool(event.get("name") or self.call_names.get(call_id, ""), call_id, event.get("arguments") or "{}")
            elif kind == "response.output_item.done":
                # The complete function_call item; it is the only place some API versions carry the name.
                item = event.get("item") or {}
                if item.get("type") == "function_call":
                    await self._run_tool(item.get("name") or "", item.get("call_id") or "", item.get("arguments") or "{}")
            elif kind == "response.done":
                response = event.get("response") or {}
                self._count_usage(response.get("usage") or {})
                self.active_response = None
                if self.ending_response and response.get("id") == self.ending_response and self.final_mark is None:
                    self.closed.set()  # The goodbye had no audio; nothing to wait for.
                if self.pending_outputs:
                    # Tool results go back only after the calling response is done, then one new response.
                    outputs, self.pending_outputs = self.pending_outputs, []
                    for output in outputs:
                        await self._send_vl({"type": "conversation.item.create", "item": output})
                    await self._send_vl({"type": "response.create"})
                    if self.ending and self.ending_response is None:
                        self.await_goodbye = True
            elif kind == "error":
                error = event.get("error") or {}
                log.warning("call=%s voice live error code=%s", self.call_id, error.get("code") or error.get("type"))

    # ---- tools ----------------------------------------------------------------------------------------------------

    async def _run_tool(self, name: str, call_id: str, arguments: str) -> None:
        if not call_id or call_id in self.calls_run:
            return  # Already handled from the other event that announced the same call.
        self.calls_run.add(call_id)
        self.tool_names.append(name)
        try:
            args = json.loads(arguments) if arguments else {}
        except ValueError:
            args = {}
        if name == "set_language":
            language = str(args.get("language") or "").lower()
            if language in LANGUAGES:
                self.language = language
                await self._send_vl({"type": "session.update", "session": {"voice": self._voice()}})
                result = {"ok": True, "language": language_name(language)}
            else:
                result = {"error": "language must be one of en, hi, te, kn"}
        elif name == "refresh_orders":
            context = await self.backend.context(self.phone)
            if context is None:
                result = {"error": "Craves records are not reachable right now."}
            else:
                self.context = context
                result = {"caller": context.get("caller"), "orders": context.get("orders") or []}
        elif name == "open_support_ticket":
            if self.ticket_opened:
                result = {"error": "A ticket was already opened on this call. Do not open another."}
            else:
                result = await self.backend.open_ticket(self.phone, str(args.get("subject") or ""),
                                                        str(args.get("details") or ""), args.get("caller_name"),
                                                        language_name(self.language))
                if "caseNumber" in result:
                    self.ticket_opened = True
                    result["note"] = ("Tell the caller the team will get back to them on this number. Only if they ask "
                                      "for a reference, read the last six characters slowly.")
        elif name == "end_call":
            self.ending = True
            result = {"ok": True, "note": "Say a short goodbye now; the line closes after it."}
        else:
            result = {"error": f"unknown tool {name}"}
        self.pending_outputs.append({"type": "function_call_output", "call_id": call_id, "output": json.dumps(result, ensure_ascii=False)})

    # ---- messages -------------------------------------------------------------------------------------------------

    def _session_update(self, instructions: str) -> dict[str, Any]:
        transcription: dict[str, Any] = {"model": self.settings.stt_model}
        if not self.settings.stt_model.startswith("mai-transcribe"):
            transcription["language"] = self.settings.stt_languages
        return {"type": "session.update", "session": {
            "modalities": ["text", "audio"],
            "instructions": instructions,
            "voice": self._voice(),
            "input_audio_format": "pcm16",
            "input_audio_sampling_rate": 16000,
            "output_audio_format": "pcm16_16000hz",
            "input_audio_transcription": transcription,
            "input_audio_noise_reduction": {"type": "azure_deep_noise_suppression"},
            "turn_detection": {"type": self.settings.voice_live_turn_detection, "threshold": 0.5,
                               "prefix_padding_ms": 300, "silence_duration_ms": 700,
                               "create_response": True, "interrupt_response": True},
            "tools": TOOLS,
            "tool_choice": "auto",
            "temperature": 0.7,
            "max_response_output_tokens": 500,
        }}

    def _voice(self) -> dict[str, Any]:
        return {"type": "azure-standard", "name": self.settings.voices[self.language], "rate": self.settings.speaking_rate}

    async def _say(self, text: str) -> None:
        """A user-side note the caller never hears, then a response: used for the greeting and the wrap-up."""
        await self._send_vl({"type": "conversation.item.create", "item": {
            "type": "message", "role": "user", "content": [{"type": "input_text", "text": text}]}})
        await self._send_vl({"type": "response.create"})

    async def _send_media(self, chunk: bytes) -> None:
        await self._send_exotel({"event": "media", "stream_sid": self.stream_sid,
                                 "media": {"payload": base64.b64encode(chunk).decode("ascii")}})

    async def _send_exotel(self, message: dict[str, Any]) -> None:
        try:
            await self.exotel.send(json.dumps(message))
        except ConnectionClosed:
            self.closed.set()

    async def _send_vl(self, message: dict[str, Any]) -> None:
        await self.voice_live.send(json.dumps(message, ensure_ascii=False))

    async def _close_exotel(self) -> None:
        try:
            await self.exotel.close()
        except Exception:  # noqa: BLE001 - already gone
            pass

    def _count_usage(self, usage: dict[str, Any]) -> None:
        self.usage["responses"] += 1
        self.usage["input_tokens"] += int(usage.get("input_tokens") or 0)
        self.usage["output_tokens"] += int(usage.get("output_tokens") or 0)
        self.usage["audio_input_tokens"] += int((usage.get("input_token_details") or {}).get("audio_tokens") or 0)
        self.usage["audio_output_tokens"] += int((usage.get("output_token_details") or {}).get("audio_tokens") or 0)


def _json(raw: str | bytes) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


# ---- server -------------------------------------------------------------------------------------------------------

class Server:
    def __init__(self, settings: Settings, backend: Backend) -> None:
        self.settings = settings
        self.backend = backend
        self.active_calls = 0
        self.missing = settings.missing()

    def authorized(self, request: Any) -> bool:
        """Exotel sends the password from the applet URL as Basic auth; ?key= is accepted for manual tests."""
        expected = self.settings.exotel_password.encode()
        if not expected:
            return False
        header = request.headers.get("Authorization", "")
        if header.startswith("Basic "):
            try:
                _, _, password = base64.b64decode(header[6:]).decode("utf-8").partition(":")
            except (binascii.Error, UnicodeDecodeError):
                return False
            return hmac.compare_digest(password.encode(), expected)
        query = request.path.partition("?")[2]
        for pair in query.split("&"):
            name, _, value = pair.partition("=")
            if name == "key":
                return hmac.compare_digest(value.encode(), expected)
        return False

    async def process_request(self, connection: ServerConnection, request: Any) -> Any:
        path = request.path.partition("?")[0]
        if path in ("/", "/healthz"):
            if self.missing:
                return connection.respond(HTTPStatus.SERVICE_UNAVAILABLE, "missing settings: " + ", ".join(self.missing) + "\n")
            return connection.respond(HTTPStatus.OK, "ok\n")
        if path != "/exotel/voice":
            return connection.respond(HTTPStatus.NOT_FOUND, "not found\n")
        if self.missing:
            return connection.respond(HTTPStatus.SERVICE_UNAVAILABLE, "not configured\n")
        if not self.authorized(request):
            return connection.respond(HTTPStatus.UNAUTHORIZED, "unauthorized\n")
        if self.active_calls >= self.settings.max_concurrent_calls:
            log.warning("call rejected: %d calls already active", self.active_calls)
            return connection.respond(HTTPStatus.SERVICE_UNAVAILABLE, "busy\n")
        return None

    async def handle(self, connection: ServerConnection) -> None:
        self.active_calls += 1
        call_id = uuid.uuid4().hex[:12]
        try:
            await CallSession(self.settings, self.backend, connection, call_id).run()
        finally:
            self.active_calls -= 1

    async def serve_forever(self) -> None:
        if self.missing:
            log.error("not configured; health answers 503 until these are set: %s", ", ".join(self.missing))
        async with serve(self.handle, "0.0.0.0", self.settings.port, process_request=self.process_request,
                         max_size=1024 * 1024, ping_interval=20, ping_timeout=20):
            log.info("voice-support-gateway listening on %d model=%s", self.settings.port, self.settings.voice_live_model)
            await asyncio.Future()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = Settings.from_env()
    asyncio.run(Server(settings, Backend(settings.backend_base_url, settings.internal_secret)).serve_forever())
