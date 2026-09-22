import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, '..');

const failures = [];
const warnings = [];

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(mobileRoot, relativePath));
}

function requireFile(relativePath, message) {
  if (!exists(relativePath)) failures.push(`${relativePath}: ${message}`);
}

function requireMarker(relativePath, marker, message) {
  const source = read(relativePath);
  if (!source.includes(marker)) failures.push(`${relativePath}: ${message}`);
}

function warnWhen(relativePath, predicate, message) {
  const source = read(relativePath);
  if (predicate(source)) warnings.push(`${relativePath}: ${message}`);
}

requireFile(
  'ios/GoogleService-Info.plist',
  'missing iOS Firebase config. Add the production/staging Firebase plist through CI secrets or secure release preparation; do not paste secrets into chat.',
);
requireFile(
  'ios/Podfile.lock',
  'missing CocoaPods lockfile. Run `bundle exec pod install` on a macOS runner and commit the resulting lockfile for reproducible iOS builds.',
);

requireMarker(
  'ios/CravesMobile/Info.plist',
  '<string>craves</string>',
  'missing craves:// deep-link URL scheme.',
);
requireMarker(
  'ios/CravesMobile/Info.plist',
  'NSLocationWhenInUseUsageDescription',
  'missing foreground location permission usage description.',
);
requireMarker(
  'ios/CravesMobile/Info.plist',
  'NSPhotoLibraryUsageDescription',
  'missing photo library usage description required by chef menu image picker.',
);
requireMarker(
  'ios/CravesMobile/Info.plist',
  'LSApplicationQueriesSchemes',
  'missing queried payment app schemes for UPI/payment app handoff checks.',
);
requireMarker(
  'ios/CravesMobile/PrivacyInfo.xcprivacy',
  'NSPrivacyAccessedAPITypes',
  'missing Apple privacy accessed API declaration.',
);
[
  'NSPrivacyCollectedDataTypeName',
  'NSPrivacyCollectedDataTypeEmailAddress',
  'NSPrivacyCollectedDataTypePhoneNumber',
  'NSPrivacyCollectedDataTypePhysicalAddress',
  'NSPrivacyCollectedDataTypePreciseLocation',
  'NSPrivacyCollectedDataTypeUserID',
  'NSPrivacyCollectedDataTypePurchaseHistory',
  'NSPrivacyCollectedDataTypePaymentInfo',
  'NSPrivacyCollectedDataTypePhotosorVideos',
  'NSPrivacyCollectedDataTypeOtherUserContent',
].forEach(dataType => {
  requireMarker(
    'ios/CravesMobile/PrivacyInfo.xcprivacy',
    dataType,
    `missing privacy collected data declaration for ${dataType}.`,
  );
});
requireMarker(
  'ios/CravesMobile/AppDelegate.swift',
  'RCTLinkingManager.application',
  'missing React Native deep-link forwarding in AppDelegate.',
);
requireMarker(
  'ios/CravesMobile/AppDelegate.swift',
  'import FirebaseCore',
  'missing FirebaseCore import required for explicit Firebase startup on iOS.',
);
requireMarker(
  'ios/CravesMobile/AppDelegate.swift',
  'FirebaseApp.configure()',
  'missing explicit FirebaseApp.configure() startup before React Native launches.',
);
requireMarker(
  'ios/CravesMobile.xcodeproj/project.pbxproj',
  'GoogleService-Info.plist in Resources',
  'missing GoogleService-Info.plist in the Xcode app resource phase.',
);
requireMarker(
  'ios/CravesMobile.xcodeproj/project.pbxproj',
  'PRODUCT_BUNDLE_IDENTIFIER = com.craves.mobile;',
  'missing expected iOS bundle identifier com.craves.mobile in target build settings.',
);
requireMarker(
  'ios/GoogleService-Info.plist',
  '<string>com.craves.mobile</string>',
  'Firebase plist bundle ID placeholder must match the Xcode bundle identifier.',
);
requireMarker(
  'ios/CravesMobile/AppDelegate.swift',
  'import React',
  'missing the React module import required by the Swift AppDelegate.',
);
requireMarker(
  'ios/CravesMobile/CravesCurrentLocation.m',
  'requestWhenInUseAuthorization',
  'missing native iOS foreground location permission bridge.',
);

warnWhen(
  'ios/CravesMobile/Info.plist',
  source => source.includes('<string>CravesMobile</string>'),
  'display name is still CravesMobile. Confirm whether App Store builds should display "Craves".',
);
warnWhen(
  'ios/CravesMobile/PrivacyInfo.xcprivacy',
  source => source.includes('<key>NSPrivacyCollectedDataTypes</key>\n\t<array/>'),
  'privacy manifest declares no collected data. Reconcile this before App Store submission because the app handles location, profile, order, and payment-flow data.',
);

if (warnings.length > 0) {
  console.warn('iOS release readiness warnings:');
  warnings.forEach(warning => console.warn(`- ${warning}`));
}

if (failures.length > 0) {
  console.error('iOS release readiness check failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('iOS release readiness check passed.');
