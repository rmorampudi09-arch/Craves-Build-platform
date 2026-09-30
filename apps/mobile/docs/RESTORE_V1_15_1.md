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

- Restoration source: `cc551b94a96f3f8d033bc685a085cee1e83ff964`.
- Tag: `KUSHIRAVI-app-v1.15.1-restored`. The original v1.15.1 tag/APK are unchanged.
- APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.1-restored.apk`.
- APK SHA-256: `E94A60B65326DD332901EBDA15A604CBD67098CB982680990C8DE1E37FC081E5`.
- ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.15.1-restored-source.zip`.
- ZIP SHA-256: `685C8A04E48DE3EFBF41A78F4380B4730A5418B5D1F1FE7DAC6F3D88EA4042E4`.
- Verified all `src` and Android files match the original tag except versionCode.
- TypeScript and scoped ESLint passed; 186 Jest suites / 939 tests passed.
  Test evidence: `C:\mscratch\artifacts\v1151-restored-tests.log`.
- Signed ARM64 release passed in 10m 36s, 823 tasks (41 executed). Build log:
  `C:\mscratch\artifacts\v1151-restored-release-build.log`.
- APK package `com.cravesapp`, code 22 / name 1.15.1 verified; v2/v3 signatures
  verified. Registered signing SHA-1 remains
  `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`, SHA-256
  `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
- ZIP archived from the exact restoration source; wrapper, lockfile, build script
  and baseline instructions present. No private .env, node_modules or withdrawn
  renderer files. Later evidence-only commits do not change this APK/tag/ZIP.
- Replace-install succeeded on `RS7PB6VOY9ZLLFYD` at `2026-09-30 19:49:46`;
  Android reports versionCode 22 / versionName 1.15.1. No user data cleared.
- Rebuild with `C:\mscratch\apps\mobile\scripts\build-kushiravi-release-apk.ps1`.

## Phone Verification

- Cold launch opened the existing authenticated Customer Home normally.
- Three 700 ms downward swipes followed by a pause stayed on the same food
  cards, including Paneer biriyani. Captures at 19:51:19 and 19:51:26 retain
  the same card positions. A 220 px reverse swipe moved the feed normally and
  restored the existing floating menu; no jump to top occurred in this check.
- Screenshots: `C:\mscratch\artifacts\v1151-restored-start.png`,
  `v1151-restored-deep-a.png`, `v1151-restored-deep-b.png`,
  `v1151-restored-reverse.png` in the same artifacts folder.
- Post-install crash and JS/native error buffers are empty:
  `C:\mscratch\artifacts\v1151-restored-crashes.log`,
  `C:\mscratch\artifacts\v1151-restored-errors.log`.
- Phone left on Customer Home partway down the feed. No transaction, favorite,
  menu or Chef availability mutation. Not a claim to have fixed every pre-existing
  issue or verified actual payment completion. iOS hardware not tested.
- Role persistence and payment orchestration remain the exact approved source
  with their existing passing tests; no new live Chef switch/payment was performed.

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
