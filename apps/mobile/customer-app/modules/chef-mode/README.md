# Craves React Native Chef Mode Shell

## Scope

Adds role-aware chef navigation to the existing secure customer mobile application.

## Flow

```text
Keychain/Keystore Craves session
  -> backend-issued identity roles
  -> Chef Mode screen
  -> approved-chef navigation or application-status screen
```

## Safety

- The client does not grant or persist the CHEF role.
- Backend services remain authoritative for every chef operation.
- Customer-only identities can view only reduced application status.
- Application identity, phone, document storage paths and file contents are excluded.
- No token is logged or placed in AsyncStorage.
- Kitchen/menu and chef-order destinations are typed placeholders until child modules replace them.

## Pipeline

`azure-pipelines-chef-mobile-mode-ci.yml`

Native shell generation, Firebase files, signing and store work remain manual later gates.
