# Secrets Handling

Do not paste real keys into source code.

Use:
- Local development: `.env`
- Azure deployment: Azure Key Vault
- Azure DevOps: Variable Groups linked to Key Vault

Required future keys:
- Firebase project credentials
- PostgreSQL connection string
- ACS connection string
- Cashfree credentials
- Borzo and Pidge credentials
- Google Maps API key

## Rotating a courier webhook secret

Each courier's webhook check accepts the current secret and, when set, one previous secret.

| Courier | Current | Previous (optional, empty by default) |
|---|---|---|
| Borzo | `BORZO_CALLBACK_TOKEN` | `BORZO_CALLBACK_TOKEN_PREVIOUS` |
| Pidge | `PIDGE_WEBHOOK_TOKEN` | `PIDGE_WEBHOOK_TOKEN_PREVIOUS` |

Steps:
1. Set the new value as the current variable and the old value as the previous variable; restart the service.
2. Update the value in the courier's dashboard (or ask the courier to update it).
3. Watch the log line `COURIER_WEBHOOK_PREVIOUS_SECRET_USED provider=<borzo|pidge>`; one line is written per callback
   that matched the previous value. Wait until none has appeared for a full day.
4. Remove the previous variable; restart the service.

With the previous variable empty, only the current value is accepted. The log line carries no values.
If the old value must stop working immediately, leave the previous variable empty.
