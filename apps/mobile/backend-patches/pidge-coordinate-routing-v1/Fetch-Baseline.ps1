param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$registryName = 'cravesrm09prodlow6bf632'
$registry = "$registryName.azurecr.io"
$digest = 'sha256:84c06314f147e326adfb6a23cf27fbdfd8950b8863c829b1d5558a1039c44763'
$root = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $root -Force | Out-Null
$login = az acr login -n $registryName --expose-token -o json --only-show-errors | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot authenticate to the existing registry' }
try {
    $exchange = Invoke-RestMethod -Method Post -Uri "https://$registry/oauth2/token" -Body @{
        grant_type = 'refresh_token'; service = $registry
        scope = 'repository:craves/integration-service:pull'; refresh_token = $login.accessToken
    } -TimeoutSec 45
    $headers = @{ Authorization = 'Bearer ' + $exchange.access_token; Accept = 'application/vnd.docker.distribution.manifest.v2+json' }
    $manifest = Invoke-RestMethod -Uri "https://$registry/v2/craves/integration-service/manifests/$digest" -Headers $headers -TimeoutSec 45
    $layer = $manifest.layers[-1]
    $archive = Join-Path $root 'baseline-layer.tar.gz'
    Invoke-WebRequest -Uri "https://$registry/v2/craves/integration-service/blobs/$($layer.digest)" -Headers $headers -OutFile $archive -TimeoutSec 180
    if ('sha256:' + (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $layer.digest) {
        throw 'Baseline layer digest does not match the immutable manifest'
    }
    $entries = & tar -tzf $archive
    if ($LASTEXITCODE -ne 0 -or 'app/app.jar' -notin $entries) { throw 'Expected baseline JAR is not present in the image layer' }
    & tar -xzf $archive -C $root app/app.jar
    if ($LASTEXITCODE -ne 0) { throw 'Baseline JAR extraction failed' }
    $jar = Join-Path $root 'app\app.jar'
    [PSCustomObject]@{ Image = "$registry/craves/integration-service@$digest"; Jar = $jar; JarSha256 = (Get-FileHash $jar).Hash }
} finally {
    $login = $null; $exchange = $null; $headers = $null
}
