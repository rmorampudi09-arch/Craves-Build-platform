# Craves iOS Xcode Build Through GitHub Actions

This workflow lets GitHub Actions run a macOS/Xcode build for the React Native iOS app.

Git does not build iOS by itself. GitHub Actions provides a temporary macOS runner with Xcode, CocoaPods, and Apple signing support.

## Workflow

Workflow file:

- `.github/workflows/ios-xcode-build.yml`

It has three gates:

1. `source-gates` on Ubuntu:
   - `npm ci`
   - TypeScript
   - ESLint
   - iOS release readiness
   - APIM contract coverage
   - observability audit
   - integration tests
   - e2e model tests
   - full Jest

2. `simulator-xcode-build` on macOS:
   - injects Firebase iOS plist
   - runs `bundle install`
   - runs `bundle exec pod install`
   - runs unsigned Xcode simulator build
   - uploads a simulator `.app` zip artifact

3. `signed-ipa` on macOS, optional manual dispatch:
   - imports Apple signing certificate
   - installs provisioning profile
   - runs Xcode archive
   - exports an `.ipa`
   - uploads the `.ipa` artifact

## Required GitHub Secret

Required for source and simulator builds:

- `IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64`

Create it from the real Firebase iOS file:

```bash
base64 -i GoogleService-Info.plist | pbcopy
```

Paste the copied value into GitHub:

`Settings -> Secrets and variables -> Actions -> New repository secret`

Do not commit the real `GoogleService-Info.plist`. It is intentionally ignored.

## Required GitHub Secrets For Signed IPA

Only needed when running workflow dispatch with `build_signed_ipa=true`:

- `IOS_CERTIFICATE_P12_BASE64`
- `IOS_CERTIFICATE_PASSWORD`
- `IOS_PROVISIONING_PROFILE_BASE64`
- `IOS_TEAM_ID`
- `IOS_CI_KEYCHAIN_PASSWORD`

Optional GitHub variable:

- `IOS_BUNDLE_IDENTIFIER`, defaults to `com.craves.mobile`

## iPhone Install Reality

An unsigned simulator artifact can prove the app compiles on Xcode, but it cannot be installed on a physical iPhone.

For physical iPhone install, use one of these:

- `development` export with a development provisioning profile that includes the iPhone UDID.
- `ad-hoc` export with an ad-hoc provisioning profile that includes the iPhone UDID.
- `app-store` export, then distribute through TestFlight/App Store Connect.

Firebase alone is not enough for iPhone install. Apple signing is mandatory.
