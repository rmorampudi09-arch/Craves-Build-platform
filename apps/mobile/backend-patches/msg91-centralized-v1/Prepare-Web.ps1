param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$baseline = 'e828209dc127085b8c1ffff84387a974b9eeef56'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
$root = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $root) { throw 'Use a fresh output directory.' }
New-Item -ItemType Directory -Path $root | Out-Null
$archive = Join-Path $root 'web-baseline.zip'
& git -C $repo archive --format=zip --output $archive $baseline
if ($LASTEXITCODE -ne 0) { throw 'Exact deployed web source is unavailable.' }
$baselineRoot = Join-Path $root 'repo'
Expand-Archive -LiteralPath $archive -DestinationPath $baselineRoot
$source = Join-Path $baselineRoot 'apps\customer-web-next'
$overlay = Join-Path $PSScriptRoot 'web'
foreach ($file in Get-ChildItem -LiteralPath $overlay -Recurse -File) {
    $relative = [IO.Path]::GetRelativePath($overlay, $file.FullName)
    $destination = Join-Path $source $relative
    New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination
}
[pscustomobject]@{ Baseline = $baseline; Source = $source; BaselineArchiveSha256 = (Get-FileHash $archive).Hash }
