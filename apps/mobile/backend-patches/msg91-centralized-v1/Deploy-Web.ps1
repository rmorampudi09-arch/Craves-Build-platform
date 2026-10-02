param([Parameter(Mandatory)][string]$Image, [Parameter(Mandatory)][string]$Commit,
    [Parameter(Mandatory)][string]$RevisionSuffix)
$ErrorActionPreference = 'Stop'
$group = 'rg-craves-prodlow-centralindia'
$app = 'ca-craves-web-prodlow'
$before = az containerapp show -g $group -n $app -o json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect web runtime.' }
if ($before.properties.template.containers[0].image -ne 'cravesrm09prodlow6bf632.azurecr.io/craves/customer-web-next@sha256:dcbac3bb820d99620881d135d836b330fab841c79245c7cc25c0f10599584120') {
    throw 'Web changed after preflight; do not overwrite another deployment.'
}
az containerapp update -g $group -n $app --image $Image --revision-suffix $RevisionSuffix `
    --set-env-vars 'CRAVES_CENTRAL_OTP_ENABLED=true' "CRAVES_BUILD_SHA=$Commit" `
    'CRAVES_WEB_BASELINE_SHA=e828209dc127085b8c1ffff84387a974b9eeef56' `
    --query '{revision:properties.latestRevisionName,image:properties.template.containers[0].image}' -o json
if ($LASTEXITCODE -ne 0) { throw 'Web deployment failed.' }
$after = az containerapp show -g $group -n $app -o json | ConvertFrom-Json
foreach ($entry in $before.properties.template.containers[0].env) {
    if ($entry.name -eq 'CRAVES_BUILD_SHA') { continue }
    $retained = $after.properties.template.containers[0].env | Where-Object name -eq $entry.name
    if ($retained.value -ne $entry.value -or $retained.secretRef -ne $entry.secretRef) {
        throw "Unexpected web environment change: $($entry.name)"
    }
}
Write-Output 'Existing web configuration preserved except source provenance and the new backend OTP flag.'
