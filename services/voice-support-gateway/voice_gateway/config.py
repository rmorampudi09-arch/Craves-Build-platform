"""Settings, all from the environment. Secrets come from Key Vault bindings on the container app."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

LANGUAGES = ("en", "hi", "te", "kn")

# One voice per language, all the same "agent": switched with session.update when the caller's language changes.
DEFAULT_VOICES = {
    "en": "en-IN-NeerjaNeural",
    "hi": "hi-IN-SwaraNeural",
    "te": "te-IN-ShrutiNeural",
    "kn": "kn-IN-SapnaNeural",
}


def _int(name: str, default: int) -> int:
    value = os.environ.get(name, "").strip()
    return int(value) if value else default


@dataclass(frozen=True)
class Settings:
    port: int
    # Exotel opens wss://craves:<password>@host/exotel/voice?sample-rate=16000; the password is this.
    exotel_password: str
    exotel_account_sid: str
    voice_live_endpoint: str  # https://<resource>.services.ai.azure.com
    voice_live_key: str
    voice_live_model: str
    voice_live_api_version: str
    voice_live_turn_detection: str  # server_vad or azure_semantic_vad
    stt_model: str  # azure-speech or mai-transcribe-2
    stt_languages: str  # comma-separated, first is primary
    backend_base_url: str  # user-chef-service origin
    internal_secret: str
    max_concurrent_calls: int
    max_call_seconds: int
    voices: dict[str, str] = field(default_factory=lambda: dict(DEFAULT_VOICES))
    speaking_rate: str = "1.0"

    @staticmethod
    def from_env() -> "Settings":
        voices = dict(DEFAULT_VOICES)
        for code in LANGUAGES:
            override = os.environ.get(f"VOICE_{code.upper()}", "").strip()
            if override:
                voices[code] = override
        return Settings(
            port=_int("PORT", 8080),
            exotel_password=os.environ.get("EXOTEL_STREAM_PASSWORD", "").strip(),
            exotel_account_sid=os.environ.get("EXOTEL_ACCOUNT_SID", "").strip(),
            voice_live_endpoint=os.environ.get("VOICE_LIVE_ENDPOINT", "").strip().rstrip("/"),
            voice_live_key=os.environ.get("VOICE_LIVE_API_KEY", "").strip(),
            voice_live_model=os.environ.get("VOICE_LIVE_MODEL", "gpt-4.1").strip(),
            voice_live_api_version=os.environ.get("VOICE_LIVE_API_VERSION", "2026-04-10").strip(),
            voice_live_turn_detection=os.environ.get("VOICE_LIVE_TURN_DETECTION", "server_vad").strip(),
            stt_model=os.environ.get("VOICE_STT_MODEL", "azure-speech").strip(),
            stt_languages=os.environ.get("VOICE_STT_LANGUAGES", "en-IN,hi-IN,te-IN,kn-IN").strip(),
            backend_base_url=os.environ.get("CRAVES_SUPPORT_BACKEND_BASE_URL", "").strip().rstrip("/"),
            internal_secret=os.environ.get("CRAVES_INTERNAL_SERVICE_SECRET", "").strip(),
            max_concurrent_calls=_int("MAX_CONCURRENT_CALLS", 5),
            max_call_seconds=_int("MAX_CALL_SECONDS", 600),
            voices=voices,
            speaking_rate=os.environ.get("VOICE_SPEAKING_RATE", "1.0").strip() or "1.0",
        )

    def missing(self) -> list[str]:
        """Names of the settings a call cannot work without."""
        required = {
            "EXOTEL_STREAM_PASSWORD": self.exotel_password,
            "VOICE_LIVE_ENDPOINT": self.voice_live_endpoint,
            "VOICE_LIVE_API_KEY": self.voice_live_key,
            "CRAVES_SUPPORT_BACKEND_BASE_URL": self.backend_base_url,
            "CRAVES_INTERNAL_SERVICE_SECRET": self.internal_secret,
        }
        return [name for name, value in required.items() if not value]
