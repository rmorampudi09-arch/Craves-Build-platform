param([Parameter(Mandatory)][string]$Image, [Parameter(Mandatory)][string]$RevisionSuffix,
    [string]$ExpectedImage = 'cravesrm09prodlow6bf632.azurecr.io/craves/auth-service@sha256:01b6783cf1f946b178721aa416feb47f8de98996555879f4ff3d82de2184b88b')
$ErrorActionPreference = 'Stop'
$group = 'rg-craves-prodlow-centralindia'
$app = 'ca-craves-auth-service-prodlow'
$before = az containerapp show -g $group -n $app -o json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect auth runtime.' }
$oldImage = $before.properties.template.containers[0].image
if ($oldImage -ne $ExpectedImage) {
    throw 'Auth changed after preflight; do not overwrite another deployment.'
}
az containerapp update -g $group -n $app --image $Image --revision-suffix $RevisionSuffix `
    --set-env-vars 'CRAVES_CENTRAL_OTP_ENABLED=true' 'CRAVES_MSG91_OTP_TEMPLATE_ID=6abe727541deb95f6d0b7192' `
    --query '{revision:properties.latestRevisionName,image:properties.template.containers[0].image}' -o json
if ($LASTEXITCODE -ne 0) { throw 'Auth deployment failed; clients have not been switched.' }
$after = az containerapp show -g $group -n $app -o json | ConvertFrom-Json
foreach ($entry in $before.properties.template.containers[0].env) {
    $retained = $after.properties.template.containers[0].env | Where-Object name -eq $entry.name
    if ($retained.value -ne $entry.value -or $retained.secretRef -ne $entry.secretRef) {
        throw "Unexpected auth environment change: $($entry.name)"
    }
}
foreach ($secret in $before.properties.configuration.secrets) {
    $retained = $after.properties.configuration.secrets | Where-Object name -eq $secret.name
    if ($retained.keyVaultUrl -ne $secret.keyVaultUrl -or $retained.identity -ne $secret.identity) {
        throw "Unexpected secret reference change: $($secret.name)"
    }
}
Write-Output 'Existing auth configuration/Key Vault references preserved.'
