param([Parameter(Mandatory)][string]$BaselineJar, [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$JavaHome = 'C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot')
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $root) { throw 'Use a fresh output directory.' }
if ((Get-FileHash -LiteralPath $BaselineJar).Hash -ne '5CA977C512A6C7C638878DFEC07E4413790A7D2B2E13A709B4C4692D365C01D2') {
    throw 'Unexpected live auth baseline; inspect and pin the new runtime first.'
}
$baseline = Join-Path $root 'baseline'
$classes = Join-Path $root 'patch/BOOT-INF/classes'
New-Item -ItemType Directory -Path $baseline,$classes -Force | Out-Null
[IO.Compression.ZipFile]::ExtractToDirectory([IO.Path]::GetFullPath($BaselineJar), $baseline)
$baselineClassesJar = Join-Path $root 'baseline-classes.jar'
& "$JavaHome/bin/jar.exe" --create --file $baselineClassesJar -C "$baseline/BOOT-INF/classes" .
if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare baseline classes' }
$classpath = "$baseline/BOOT-INF/classes;$baseline/BOOT-INF/lib/*"
$sources = @(Get-ChildItem -LiteralPath "$PSScriptRoot/src/main/java" -Recurse -Filter '*.java' | Select-Object -ExpandProperty FullName)
& "$JavaHome/bin/javac.exe" --release 21 -parameters -g -cp $classpath -d $classes @sources
if ($LASTEXITCODE -ne 0) { throw 'OTP additions do not compile against the exact live runtime' }
Copy-Item -LiteralPath "$PSScriptRoot/src/main/resources/db" -Destination "$classes/db" -Recurse
$patchedJar = Join-Path $root 'app.jar'
Copy-Item -LiteralPath $BaselineJar -Destination $patchedJar
& "$JavaHome/bin/jar.exe" --update --file $patchedJar -C "$root/patch" BOOT-INF/classes
if ($LASTEXITCODE -ne 0) { throw 'JAR update failed' }
$before = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($BaselineJar))
$after = [IO.Compression.ZipFile]::OpenRead($patchedJar)
try {
    foreach ($entry in $before.Entries) {
        if ($entry.FullName.EndsWith('/')) { continue }
        $replacement = $after.GetEntry($entry.FullName)
        if ($null -eq $replacement) { throw "Removed baseline entry $($entry.FullName)" }
        $old = $entry.Open(); $new = $replacement.Open()
        try {
            if ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($old)) -ne
                [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($new))) {
                throw "Changed unrelated baseline entry $($entry.FullName)"
            }
        } finally { $old.Dispose(); $new.Dispose() }
    }
    $added = @($after.Entries | Where-Object { -not $_.FullName.EndsWith('/') -and $null -eq $before.GetEntry($_.FullName) } | ForEach-Object FullName)
    foreach ($name in $added) {
        if ($name -notmatch '^BOOT-INF/classes/in/craves/auth/centralotp/[^/]+\.class$' -and
            $name -ne 'BOOT-INF/classes/db/migration/V19__centralized_phone_otp.sql') {
            throw "Unexpected added entry $name"
        }
    }
    [PSCustomObject]@{ Jar=$patchedJar; BaselineClassesJar=$baselineClassesJar; Sha256=(Get-FileHash $patchedJar).Hash; AddedEntries=$added }
} finally { $before.Dispose(); $after.Dispose() }
