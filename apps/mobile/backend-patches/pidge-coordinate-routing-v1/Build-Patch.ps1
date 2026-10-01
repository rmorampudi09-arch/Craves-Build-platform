param(
    [Parameter(Mandatory)][string]$BaselineJar,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [Parameter(Mandatory)][string]$JavaHome
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $root -Force | Out-Null
$baseline = Join-Path $root 'baseline'
$classes = Join-Path $root 'patch\BOOT-INF\classes'
New-Item -ItemType Directory -Path $baseline,$classes -Force | Out-Null
[IO.Compression.ZipFile]::ExtractToDirectory([IO.Path]::GetFullPath($BaselineJar), $baseline)
$baselineClassesJar = Join-Path $root 'baseline-classes.jar'
& (Join-Path $JavaHome 'bin\jar.exe') --create --file $baselineClassesJar -C (Join-Path $baseline 'BOOT-INF\classes') .
if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare the exact production classes for tests' }
$classpath = (Join-Path $baseline 'BOOT-INF\classes') + ';' + (Join-Path $baseline 'BOOT-INF\lib\*')
$sources = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'src\main\java') -Recurse -Filter '*.java' | Select-Object -ExpandProperty FullName)
& (Join-Path $JavaHome 'bin\javac.exe') --release 21 -parameters -g -cp $classpath -d $classes @sources
if ($LASTEXITCODE -ne 0) { throw 'Patch does not compile against the exact production runtime' }
$patchedJar = Join-Path $root 'app.jar'
Copy-Item -LiteralPath $BaselineJar -Destination $patchedJar
& (Join-Path $JavaHome 'bin\jar.exe') --update --file $patchedJar `
    -C (Join-Path $root 'patch') BOOT-INF/classes/in/craves/integration/delivery/pidge/PidgeApiClient.class `
    -C (Join-Path $root 'patch') BOOT-INF/classes/in/craves/integration/delivery/pidge/PidgeTransport.class
if ($LASTEXITCODE -ne 0) { throw 'JAR patch failed' }
$before = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($BaselineJar))
$after = [IO.Compression.ZipFile]::OpenRead($patchedJar)
try {
    $changed = [Collections.Generic.List[string]]::new()
    foreach ($entry in $before.Entries) {
        if ($entry.FullName.EndsWith('/')) { continue }
        $replacement = $after.GetEntry($entry.FullName)
        if ($null -eq $replacement) { throw "Patch removed archive entry $($entry.FullName)" }
        $oldStream = $entry.Open(); $newStream = $replacement.Open()
        try {
            $oldHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($oldStream))
            $newHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($newStream))
        } finally { $oldStream.Dispose(); $newStream.Dispose() }
        if ($oldHash -ne $newHash) { $changed.Add($entry.FullName) }
    }
    $allowed = @(
        'BOOT-INF/classes/in/craves/integration/delivery/pidge/PidgeApiClient.class',
        'BOOT-INF/classes/in/craves/integration/delivery/pidge/PidgeTransport.class'
    )
    foreach ($entry in $changed) { if ($entry -notin $allowed) { throw "Unexpected production change: $entry" } }
    foreach ($entry in $after.Entries) {
        if (-not $entry.FullName.EndsWith('/') -and $null -eq $before.GetEntry($entry.FullName)) { throw "Unexpected added production entry: $($entry.FullName)" }
    }
    [PSCustomObject]@{ Jar = $patchedJar; BaselineClassesJar = $baselineClassesJar; Sha256 = (Get-FileHash $patchedJar).Hash; ChangedEntries = @($changed) }
} finally { $before.Dispose(); $after.Dispose() }
