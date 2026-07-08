# Craves API Test Dashboard

Internal web dashboard for testing the current Craves backend flow without running manual `curl` commands every time.

## What this module tests

1. Firebase Phone OTP login
2. Firebase ID token generation
3. Craves Auth token exchange through APIM
4. Craves `/api/v1/auth/me`
5. Craves `/api/v1/notifications/in-app`
6. Craves `PATCH /api/v1/notifications/in-app/{noticeId}/read`

## Deployment target

This module is deployed as a container image to the existing Craves web Azure Container App:

```text
Resource group: rg-craves-prodlow-centralindia
Container App: ca-craves-web-prodlow
ACR: cravesprodlowacr82121
APIM base URL: https://apim-craves-prodlow-l3ing6.azure-api.net
```

## Local setup

Create `.env.local` inside this folder:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_APIM_BASE_URL=https://apim-craves-prodlow-l3ing6.azure-api.net
```

Then run:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Azure DevOps pipeline

Pipeline YAML added at repository root:

```text
azure-pipelines-api-test-dashboard.yml
```

It builds:

```text
apps/api-test-dashboard/Dockerfile
```

and pushes the image to:

```text
cravesprodlowacr82121.azurecr.io/craves/api-test-dashboard:<BuildId>
```

Then it deploys the image to:

```text
ca-craves-web-prodlow
```

## Required Azure DevOps variables

These should already match the Firebase auth test pipeline pattern used earlier:

```text
AZURE_SERVICE_CONNECTION
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
```

Do not paste private secrets into chat. Firebase Web Config values are public browser config values, but still keep them in Azure DevOps variables for consistent deployment.

## Firebase Console manual check

Firebase Authentication must allow the deployed Container App domain:

```text
ca-craves-web-prodlow.happysand-aedc7165.centralindia.azurecontainerapps.io
```

For local testing, also allow:

```text
localhost
```

## Expected successful test result

After OTP login and token exchange:

```text
Auth /me: HTTP 200
Notification Inbox: HTTP 200
Mark as Read: HTTP 204 or HTTP 200
```

`204 No Content` for mark-as-read is success.
