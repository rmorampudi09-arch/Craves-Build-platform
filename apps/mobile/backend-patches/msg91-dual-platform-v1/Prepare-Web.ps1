param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$baseline = '889fea7b13d9b05be86ea482c8abbfb387544750'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
$root = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $root) { throw 'Use a fresh output directory; existing contents are never overwritten.' }
New-Item -ItemType Directory -Path $root | Out-Null
$archive = Join-Path $root 'web-baseline.zip'
& git -C $repo archive --format=zip --prefix=apps/customer-web-next/ --output $archive "${baseline}:apps/customer-web-next"
if ($LASTEXITCODE -ne 0) { throw 'Exact deployed web source is unavailable. Fetch the baseline commit first.' }
$baselineRoot = Join-Path $root 'repo'
Expand-Archive -LiteralPath $archive -DestinationPath $baselineRoot
$source = Join-Path $baselineRoot 'apps\customer-web-next'
$fixtures = Join-Path $root 'web-test-fixtures.zip'
& git -C $repo archive --format=zip --output $fixtures $baseline `
    azure-pipelines-customer-web-next-delivery-tracking.yml `
    azure-pipelines-customer-addresses-apim.yml scripts/apim/configure-customer-addresses-apim.sh
if ($LASTEXITCODE -ne 0) { throw 'Cannot restore the existing read-only deployment test fixtures.' }
Expand-Archive -LiteralPath $fixtures -DestinationPath $baselineRoot
$overlay = Join-Path $PSScriptRoot 'web'
foreach ($file in Get-ChildItem -LiteralPath $overlay -Recurse -File) {
    $relative = [IO.Path]::GetRelativePath($overlay, $file.FullName)
    $destination = Join-Path $source $relative
    New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination
}
[pscustomobject]@{ Baseline = $baseline; Source = $source; BaselineArchiveSha256 = (Get-FileHash $archive).Hash }
