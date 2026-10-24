# Competitive REA dossiers: Swiggy, Zepto, Cookr, Swish

Evidence date: 24 October 2026. Scope: the big operating flows (security, fraud and abuse,
customer handling, food and partner trust, privacy and compliance), not UI features.

| File | What it answers |
| --- | --- |
| [rea-swiggy.md](rea-swiggy.md) | How Swiggy protects accounts, stops abuse and resolves order problems at national scale |
| [rea-zepto.md](rea-zepto.md) | How Zepto runs instant resolution and edge defence, and where its trust broke |
| [rea-cookr.md](rea-cookr.md) | The closest home-chef model: chef vetting, food trust, support |
| [rea-swish.md](rea-swish.md) | Own-kitchen 10-minute food: quality at speed, refunds, support |
| [craves-vs-market.md](craves-vs-market.md) | Scorecard, the best flows in the market, why Craves is behind, and how to compete |

## How these dossiers were made

They follow the method of [REA (Reverse Engineer Anything)](https://github.com/morluto/rea):
every conclusion is labelled as an **observation**, an **inference** or an **unknown**, and
points to an evidence ID. Evidence IDs look like `EV-SWG-03` (company code, number).

| Code | Company |
| --- | --- |
| SWG | Swiggy |
| ZEP | Zepto |
| CKR | Cookr |
| SWS | Swish |
| CRV | Craves |
| REG | Indian regulation (applies to everyone) |

Evidence types, strongest first:

1. **Live observation**: something we fetched ourselves on 24 Oct 2026 (HTTP headers, TLS
   certificates, a single page load in stock headless Chromium).
2. **Company document**: the company's own policy, help, filing or engineering post.
3. **Third-party static analysis**: for example the Exodus Privacy report of an app's
   embedded SDKs and permissions, and the Google Play Data safety declaration.
4. **Reporting**: reputable news, regulator orders, court rulings.
5. **Signals**: app-store reviews and complaint sites. Never used alone for a conclusion.

## Authority boundary

Only public material was used. Nothing was logged into, no competitor API was called, and no
bot protection was bypassed. When a site's WAF blocked or challenged our browser, that response
was recorded as evidence and we stopped. Competitor app binaries were not decompiled: their
terms forbid it, so the SDK inventory comes from public third-party analysis (Exodus) and the
store declarations instead.

## Tooling note

The REA CLI itself (`npx rea-agents`) was blocked in the session that produced this, so the
web evidence was collected by hand with the same passive steps REA's `inspect_web_page` takes.
To reproduce or refresh:

```bash
# Edge, WAF and security headers
curl -sS -D - -o /dev/null https://www.swiggy.com/
# TLS certificate validity
echo | openssl s_client -connect cookr.in:443 -servername cookr.in 2>/dev/null \
  | openssl x509 -noout -issuer -dates
# Vulnerability disclosure contact
curl -sS -o /dev/null -w '%{http_code}\n' https://www.zepto.com/.well-known/security.txt
```

With REA available, the equivalent passive capture is `rea inspect-web-page` against a page
open in a local Chrome (see REA `docs/browser-observation.md`), then `rea analyze-web-bundle`
for route and vendor candidates.

## Refresh

Re-run the commands above and re-read each company's help, refund and privacy pages every
quarter, and whenever a competitor makes news for a breach, a regulator action or a policy
change. Update the evidence date at the top of each dossier.
