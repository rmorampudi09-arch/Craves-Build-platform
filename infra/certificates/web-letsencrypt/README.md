# craves.in / www.craves.in certificate renewal

`craves.in` and `www.craves.in` are served by Azure Front Door (`afd-craves-prodlow`) with a customer certificate: Front Door secret `craves-web-tls` points at Key Vault certificate `kvcravesprodlowkmqgfy/craves-web-tls` with **useLatestVersion** on. This module renews that Let's Encrypt certificate (RSA 2048, both names) and imports it as a new Key Vault version; Front Door picks the new version up by itself within 72 hours. `api.craves.in` and `admin.craves.in` use Front Door managed certificates and need nothing here.

Ownership is proven with DNS-01 TXT records in the Azure DNS zone `craves.in` (the public, authoritative zone). No container app, DNS traffic record or Front Door setting is changed.

## Files

```text
azure-pipelines-web-letsencrypt-certificate.yml      Azure DevOps pipeline (weekly schedule + manual runs)
infra/certificates/web-letsencrypt/renew-web-certificate.sh
infra/certificates/web-letsencrypt/dns_cravesaz.sh      acme.sh DNS-01 hook: TXT records via the pipeline's az sign-in
scripts/release/tests/test_web_certificate_renewal.py   offline tests (fake az/dig), run in CI
```

## What the script checks before it touches anything

1. The Azure context is subscription `721906c9-4a72-4606-830b-d3e7ace093ff`.
2. The Azure DNS zone `craves.in` exists and the public nameservers for `craves.in` are exactly its Azure nameservers (otherwise Let's Encrypt would not see the TXT records). CAA records, if any, must allow `letsencrypt.org`.
3. Front Door secret `craves-web-tls` is a CustomerCertificate, points at this Key Vault certificate without a version, and has useLatestVersion on (otherwise a renewal would never reach the site).
4. The pipeline's identity can write the DNS zone (Owner, Contributor or DNS Zone Contributor) and import into the Key Vault (Key Vault Certificates Officer or Administrator; the vault uses Azure RBAC). If not, the run fails and prints the exact `az role assignment create ...` command for a subscription Owner to run once in Cloud Shell.
5. The current certificate covers both names; it is renewed only when fewer than 35 days remain (the health check pipeline alarms at 30 days, so Front Door has switched before that).

## Operations

| Operation | What it does | Changes |
|---|---|---|
| `check` (manual default) | Runs checks 1-5 and prints the expiry in Key Vault and in Front Door | nothing |
| `staging-test` | Full DNS-01 issuance against Let's Encrypt **staging**; the untrusted certificate is checked, never imported | temporary `_acme-challenge` TXT records only |
| `renew` (schedule) | Issues and imports a new version when fewer than 35 days remain; `forceIssue` renews now | new Key Vault version |

The schedule is Sunday 03:00 UTC (08:30 IST) and always runs `renew` without force. Let's Encrypt limits duplicate certificates to 5 a week: don't loop `forceIssue`.

## One-time setup

1. Create the Azure DevOps pipeline in `rmorampudi09 / Craves`: New pipeline → GitHub → `rmorampudi09-arch/Craves-Build-platform` → Existing Azure Pipelines YAML → `/azure-pipelines-web-letsencrypt-certificate.yml` → Save (don't run yet). Name it `Craves-Web-Certificate`.
2. Run it with `operation=check`. If it prints `MISSING_PERMISSION=...`, a subscription Owner runs that command in Cloud Shell, then rerun `check`.
3. Run it with `operation=staging-test` once. `STAGING_TEST=passed` proves DNS-01 works end to end.
4. Leave the schedule on. The first real renewal happens on the first Sunday within 35 days of expiry.

## After a renewal

- The run ends with `CERTIFICATE_CHANGED=true`, the new expiry and SHA-256 fingerprint.
- Within 72 hours Front Door serves it; `Craves-Production-Health-Check` (every 6 hours) checks that craves.in and www.craves.in have more than 30 days left.
- If Front Door still shows the old certificate after 72 hours, check the secret in the Azure portal (Front Door → Secrets → craves-web-tls) and that Front Door's identity still has Key Vault Secrets User on the vault.

## Security

- `acme.sh` is pinned to 3.1.4 and verified after download.
- The ACME account, private key and certificate exist only in a temporary agent directory that is deleted at the end; nothing is published as an artifact.
- DNS-01 TXT records are written by `dns_cravesaz.sh` with `az network dns record-set txt add-record/remove-record`, using the pipeline's existing az sign-in; no secret is stored in Azure DevOps. (acme.sh's own `dns_azure` plugin was dropped: its zone lookup failed on `_acme-challenge.www.craves.in` in run 400.)
- The PFX has a random password, is deleted right after import, and the imported fingerprint must equal the issued one.

## Local check

```bash
bash -n infra/certificates/web-letsencrypt/renew-web-certificate.sh
shellcheck infra/certificates/web-letsencrypt/renew-web-certificate.sh
python3 -m unittest discover -s scripts/release/tests -p 'test_web_certificate_renewal.py' -v
```
