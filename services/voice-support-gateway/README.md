# voice-support-gateway

The Craves customer care phone line. Exotel streams the call's audio here over a WebSocket; this service runs one
Azure AI Foundry Voice Live session per call (speech recognition, GPT, Indian-language voices) and sends the agent's
voice back. The agent speaks English, Telugu, Hindi and Kannada, knows the caller from the calling number
(through user-chef-service), reads their latest orders, and opens a support ticket when it cannot settle the matter.

Runbook: `docs/voice-support/README.md`. Release: `azure-pipelines-voice-support.yml`.

Local tests: `pip install -r requirements-dev.txt && python -m pytest -q` (no Azure or Exotel account needed).
