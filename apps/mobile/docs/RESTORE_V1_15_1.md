# Restore Craves v1.15.1

## Requested State

Restore the approved v1.15.1 app and ignore all subsequent app changes. Work on
`KUSHIRAVI-app-build` in `C:\mscratch\apps\mobile`, package `com.cravesapp`.
The original source is `5dece0e8cae9208aeccdcf12f231e336ad830bec`, tag
`KUSHIRAVI-app-v1.15.1`, Android versionCode 18 / versionName 1.15.1.

## Restoration

All tracked mobile files were restored from the original tag. The Home feed,
glass surface, tokens, tests and native package registration are the original
v1.15.1 implementation. Withdrawn native glass files and associated current
source documentation are absent from the active checkout. Backend files are
untouched. No GitHub push, new dependency, API deployment or business mutation.

Android cannot replace-install an older build number over the non-debuggable
installed app. Build number 22 is the only app implementation difference from
the original; visible versionName remains 1.15.1. Replace-install preserves data.
The original tag/APK remain untouched; no forced uninstall or data reset.

Documentation-only differences from the original:

- `C:\mscratch\apps\mobile\AGENTS.md`: durable approved-baseline instructions.
- `C:\mscratch\apps\mobile\KUSHIRAVI_VERSION.md`: restoration checkpoint.
- `C:\mscratch\apps\mobile\docs\RESTORE_V1_15_1.md`: this evidence record.

## Build And Delivery

- Planned tag: `KUSHIRAVI-app-v1.15.1-restored`.
- Intended APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.1-restored.apk`.
- Intended ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.1-restored-source.zip`.
- Verified all `src` and Android files match the original tag except versionCode.
- TypeScript and scoped ESLint passed; 186 Jest suites / 939 tests passed.
  Test evidence: `C:\mscratch\artifacts\v1151-restored-tests.log`.
- Source identity, release build, signing, hashes and phone installation pending final
  verification. No successful build/install is claimed until recorded below.
- Rebuild with `C:\mscratch\apps\mobile\scripts\build-kushiravi-release-apk.ps1`.

## Manual Checks

1. Open Customer Home and scroll down past several food cards, then reverse
   direction. Check that the rail pins/unpins and the feed does not jump to top.
2. Check the original v1.15.1 glass, black menu foregrounds, tab navigation and
   selection haptics. Do not evaluate withdrawn optical changes as requirements.
3. Switch Customer/Chef, close/reopen and confirm the selected workspace is
   retained. Return the phone to its original Customer workspace after testing.
4. Do not place orders, pay, alter favorites or change Chef availability during
   this restoration's read-only verification. Existing flows are restored, not
   newly changed or claimed end-to-end tested with real transactions.

## Memory Scope

The mobile `AGENTS.md` records the user's baseline so future app work does not
reuse withdrawn changes. The assistant cannot erase prior chat messages or
claim that platform memory was deleted. Existing Git checkpoints remain
untouched under the user's immutable rollback rule.
