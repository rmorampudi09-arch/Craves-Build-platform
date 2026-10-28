"""The two user-chef-service calls a phone call needs: who is calling (plus their orders) and opening a ticket."""

from __future__ import annotations

import logging
from typing import Any

import httpx

log = logging.getLogger("voice.backend")


class Backend:
    def __init__(self, base_url: str, internal_secret: str, client: httpx.AsyncClient | None = None) -> None:
        self.base_url = base_url
        self.client = client or httpx.AsyncClient(timeout=httpx.Timeout(4.0, connect=2.0))
        self.headers = {"X-Craves-Internal-Secret": internal_secret, "Accept": "application/json"}

    async def context(self, phone: str) -> dict[str, Any] | None:
        """{"caller": {...} | None, "orders": [...]}; None when the backend cannot answer (the call still goes on)."""
        try:
            response = await self.client.get(
                f"{self.base_url}/internal/v1/support/voice/context", params={"phone": phone}, headers=self.headers
            )
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            log.warning("caller context unavailable: %s", type(error).__name__)
            return None

    async def open_ticket(
        self, phone: str, subject: str, details: str, caller_name: str | None, language: str | None
    ) -> dict[str, Any]:
        """{"caseNumber": "CRV-..."} on success; {"error": "<plain words for the model>"} otherwise."""
        body = {"phone": phone, "subject": subject[:200], "details": details[:2000]}
        if caller_name:
            body["callerName"] = caller_name[:120]
        if language:
            body["language"] = language[:40]
        try:
            response = await self.client.post(
                f"{self.base_url}/internal/v1/support/voice/tickets", json=body, headers=self.headers
            )
        except httpx.HTTPError as error:
            log.warning("ticket request failed: %s", type(error).__name__)
            return {"error": "Tickets cannot be opened right now. Ask the caller to email support@craves.in."}
        if response.status_code == 429:
            return {"error": "This number has opened too many tickets today. Ask the caller to email support@craves.in."}
        if response.status_code >= 300:
            log.warning("ticket request answered HTTP %s", response.status_code)
            return {"error": "Tickets cannot be opened right now. Ask the caller to email support@craves.in."}
        try:
            return {"caseNumber": response.json()["caseNumber"]}
        except (ValueError, KeyError, TypeError):
            return {"error": "Tickets cannot be opened right now. Ask the caller to email support@craves.in."}

    async def aclose(self) -> None:
        await self.client.aclose()
