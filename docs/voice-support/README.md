# Craves voice support line

A customer care number that an AI agent answers in English, Telugu, Hindi and Kannada, in everyday spoken language.
The agent knows who is calling from the number, reads the caller's latest orders, answers from the same public guide
the chat assistant uses, and opens a support ticket for anything it cannot settle. It never transfers the call.

## How a call flows

```
caller ──► Jio number (public customer care number, call-forwarded "always")
       ──► Exotel virtual number ──► App Bazaar flow: Voicebot applet ──► Hangup
                                         │ wss, 16 kHz PCM both ways (AgentStream)
                                         ▼
                        voice-support-gateway  (ca-craves-voice-prodlow, Container Apps)
                            │ one Voice Live session per call: gpt-4.1 + azure-speech STT (en-IN, hi-IN, te-IN, kn-IN)
                            │ + one Azure neural voice per language, switched by the set_language tool
                            ▼
                 Azure AI Foundry  ais-craves-voice-prodlow  (Central India, Voice Live)

   gateway ──► user-chef-service  GET  /internal/v1/support/voice/context?phone=   (who is calling + latest orders)
                                  POST /internal/v1/support/voice/tickets          (support case, known user or guest)
            user-chef-service ──► order-service GET /internal/v1/support/orders     (same page the app shows)
```

- The Jio SIM cannot be plugged into software; it stays the public number and forwards every call to the Exotel number,
  so nothing printed or published changes. Forwarded calls normally carry the original caller's number, which the order
  lookup needs: confirm this on the first test call (the gateway log line `started caller=known` means it worked).
- Exotel is the only part Azure cannot provide: Azure Communication Services does not sell Indian numbers.
- The agent only sees the caller's own account and orders, through the same allowlist as the chat assistant
  (`SupportOrderClient`), never ids, addresses, phone numbers or chef notes. Call audio is not recorded or stored by
  Craves; the gateway logs call ids, token counts and tool names, never what was said.

## Code

| Piece | Where |
|---|---|
| Gateway (Python, `websockets` + `httpx`) | `services/voice-support-gateway/` — `app.py` bridges audio and runs the tools; `prompt.py` + `instructions.md` are what the agent is told; `guide.md` is copied from user-chef-service at image build |
| Caller lookup + tickets | `services/user-chef-service/.../supportchat/VoiceSupportService.java`, `InternalVoiceSupportController.java` |
| Orders by identity for the phone line | `services/order-service/.../web/InternalSupportOrderController.java` |
| Release | `azure-pipelines-voice-support.yml` → `scripts/release/voice-support-runtime.sh` |

Tools the model can call: `set_language` (switches the voice), `refresh_orders`, `open_support_ticket` (at most one per
call; 3 per number per day, 200 a day in total), `end_call`.

## One-time setup

1. **Backend release.** Merge the PR, then release user-chef (pipeline 17, `operation=backend`) and order-service
   (pipeline `Craves-Order-Service-Release`, `imageTag` = the main commit). Both are plain image releases: no migration,
   no runtime change. Until order-service is released, the agent still identifies callers but says order lookups are down.
2. **Azure.** Run `Craves-Voice-Support` with `operation=create`, `confirmProductionChange=true`. It creates the Foundry
   resource `ais-craves-voice-prodlow` (Central India, S0), stores its key in Key Vault as `voice-live-api-key`,
   generates and stores `exotel-stream-password`, builds the gateway image from `main` and creates
   `ca-craves-voice-prodlow` (external ingress, 1–2 replicas, Key Vault-backed secrets through the identity User/Chef
   already uses). The run prints the Exotel URL to configure, without the password.
   - If the service connection cannot write Key Vault secrets, the run says which secret to add in the portal and is
     rerun afterwards.
   - `operation=status` is read-only and safe any time.
3. **Exotel.** Sign up at exotel.com with the Craves business KYC (company PAN/GST or proprietor PAN, address proof,
   signatory ID), ask for **AgentStream** to be enabled on the account, and buy a virtual number (a Hyderabad or
   national number; this is the number Jio forwards to).
   - App Bazaar → create a flow for that number: **Voicebot** applet → **Hangup**.
   - Voicebot URL: `wss://craves:<exotel-stream-password>@<gateway fqdn>/exotel/voice?sample-rate=16000`
     (the password is Key Vault secret `exotel-stream-password`; the FQDN is printed by `create` and by `status`).
     The gateway refuses calls without that password and calls from another Exotel account
     (`EXOTEL_ACCOUNT_SID`, optional). It refuses 8 kHz streams on purpose: keep `sample-rate=16000`.
   - Recording: leave off (not needed, and callers were not told).
4. **Jio forwarding.** On the Jio phone: Settings → Calls (or Phone app → Settings → Calling accounts → Jio SIM) →
   Call forwarding → **Always forward** → the Exotel number. The `*401*` dial codes were switched off by DoT in 2024;
   use the settings menu or the MyJio app. Forwarded minutes are billed to the Jio number as outgoing calls (usually
   covered by an unlimited plan; confirm with Jio). Turn forwarding off to go back to answering the phone yourself.
5. **Test calls** in all four languages from a registered customer number, a chef number and an unknown number: greeting
   by name, order status, a ticket (check the admin Support inbox), hang-up. Check the gateway log for
   `started caller=known`.
6. **Privacy policy.** Add that calls to the support line are answered by an AI agent and processed by Microsoft Azure
   (Foundry) and Exotel, and that a ticket may be opened from what the caller said.

## Operating it

- **Kill switch:** `operation=disable` (ingress off; Exotel cannot connect and the flow hangs up). `enable` restores it.
  Turning Jio forwarding off also stops everything, with no Azure change.
- **New gateway code:** merge to `main`, then `operation=deploy` (rolls back to the previous image if the new one is not
  healthy within ten minutes).
- **Changing what the agent knows:** edit `services/user-chef-service/src/main/resources/support-assistant/guide.md`
  (public content only) and deploy the gateway (the image copies it) — the chat assistant picks it up at its next release.
  Phone manners and language rules live in `services/voice-support-gateway/voice_gateway/instructions.md`.
- **Model, voices, limits:** container app env vars `VOICE_LIVE_MODEL` (default `gpt-4.1`; `gpt-4.1-mini` is cheaper),
  `VOICE_EN|HI|TE|KN` (Azure voice names; defaults Neerja, Swara, Shruti, Sapna), `VOICE_SPEAKING_RATE`,
  `VOICE_STT_MODEL` (`azure-speech` with the four-language list, or `mai-transcribe-2` for automatic detection),
  `VOICE_LIVE_TURN_DETECTION` (`server_vad`; `azure_semantic_vad` is tuned for English and Hindi),
  `MAX_CONCURRENT_CALLS` (5; the 6th caller gets a busy signal from Exotel), `MAX_CALL_SECONDS` (600; the agent is asked
  to wrap up 30 s before).
- **Cost:** Exotel bills the virtual number and incoming minutes (around ₹0.40–0.75/min plus the plan); Voice Live bills
  per token of audio in, audio out and text (Pro tier for gpt-4.1). Budget on the order of a few rupees per minute of
  conversation; check the Azure pricing calculator for the current Voice Live Pro rates and set a cost alert on the
  resource group. Idle time costs the one running replica only.
- **Where to look:** Container Apps console logs of `ca-craves-voice-prodlow` (`call=<id> started|ended ...` lines);
  Foundry portal → the resource → metrics for token usage; Exotel dashboard for call records; admin Support inbox for
  tickets (subject starts with `Call:`; the first message says it was opened from a phone call and gives the number).

## Known limits

- One ticket per call; the ticket text is the model's English summary of what the caller said (unverified, like the chat).
- Telugu and Kannada recognition relies on the explicit four-language list; automatic detection covers English and Hindi
  only. Heavy noise or very fast code-switching can still be misheard; the agent is told to ask again rather than guess.
- No transfer to a person and no callback scheduling beyond the ticket. No DTMF menus.
- The chef view shows the chef's kitchen orders, not the chef's own purchases.
- Delivery partner tracking details are not read on the phone (order status only).
- Per-replica ticket limits, like the chat limits.
