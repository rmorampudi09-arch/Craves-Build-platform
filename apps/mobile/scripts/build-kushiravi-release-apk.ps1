param(
  [switch]$SkipNpmCi
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$mobileRoot = Split-Path -Parent $scriptRoot
$androidRoot = Join-Path $mobileRoot "android"
$appRoot = Join-Path $androidRoot "app"
$envFile = Join-Path $mobileRoot ".env"
$envExample = Join-Path $mobileRoot ".env.example"
$keystore = Join-Path $appRoot "debug.keystore"
$releaseDir = Join-Path $appRoot "build\outputs\apk\release"
$unsignedApk = Join-Path $releaseDir "app-release-unsigned.apk"
$alignedApk = Join-Path $releaseDir "app-release-aligned.apk"
$signedApk = Join-Path $releaseDir "app-release-signed.apk"

if (-not (Test-Path $envFile)) {
  Copy-Item -LiteralPath $envExample -Destination $envFile
}

if (-not $env:JAVA_HOME) {
  $defaultJdk = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
  if (Test-Path $defaultJdk) {
    $env:JAVA_HOME = $defaultJdk
  }
}

if (-not $env:JAVA_HOME) {
  throw "JAVA_HOME is not set. Install or select JDK 21 before building."
}

$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:NODE_ENV = "production"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

if (-not $SkipNpmCi) {
  Push-Location $mobileRoot
  try {
    npm ci
  } finally {
    Pop-Location
  }
}

Push-Location $androidRoot
try {
  .\gradlew.bat assembleRelease --no-daemon
} finally {
  Pop-Location
}

$buildToolsRoot = Join-Path $env:ANDROID_HOME "build-tools"
$buildTools = Get-ChildItem -LiteralPath $buildToolsRoot -Directory |
  Sort-Object {[version]$_.Name} -Descending |
  Select-Object -First 1

if (-not $buildTools) {
  throw "Android build-tools were not found under $buildToolsRoot."
}

$zipalign = Join-Path $buildTools.FullName "zipalign.exe"
$apksigner = Join-Path $buildTools.FullName "apksigner.bat"

& $zipalign -f -p 4 $unsignedApk $alignedApk
& $apksigner sign `
  --ks $keystore `
  --ks-pass pass:android `
  --key-pass pass:android `
  --ks-key-alias androiddebugkey `
  --out $signedApk `
  $alignedApk
& $apksigner verify --verbose --print-certs $signedApk

Write-Host "Signed APK ready: $signedApk"
