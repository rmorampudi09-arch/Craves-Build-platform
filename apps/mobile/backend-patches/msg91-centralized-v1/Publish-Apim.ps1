$ErrorActionPreference = 'Stop'
$subscription = '721906c9-4a72-4606-830b-d3e7ace093ff'
$base = "https://management.azure.com/subscriptions/$subscription/resourceGroups/rg-craves-prodlow-centralindia/providers/Microsoft.ApiManagement/service/apim-craves-prodlow-kmqgfy/apis/craves-auth-v1"
$token = az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv
if ($LASTEXITCODE -ne 0) { throw 'Azure sign-in required.' }
$headers = @{ Authorization = "Bearer $token" }
try {
    foreach ($action in @('send','verify')) {
        $operation = "$base/operations/central-otp-$action"
        $body = @{ properties = @{ displayName = "Central phone OTP $action"; method = 'POST'; urlTemplate = "/otp/$action" } } | ConvertTo-Json -Depth 6
        Invoke-RestMethod -Uri "${operation}?api-version=2022-08-01" -Method Put -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
        $xml = @'
<policies><inbound>
  <cors allow-credentials="false"><allowed-origins><origin>https://craves.in</origin><origin>https://www.craves.in</origin></allowed-origins>
    <allowed-methods><method>POST</method><method>OPTIONS</method></allowed-methods>
    <allowed-headers><header>Content-Type</header><header>Cache-Control</header></allowed-headers></cors>
  <base />
  <choose><when condition="@(context.Request.Body != null &amp;&amp; context.Request.Body.As&lt;byte[]&gt;(preserveContent: true).Length > 1024)">
    <return-response><set-status code="413" reason="Request too large" /><set-header name="Content-Type" exists-action="override"><value>application/json</value></set-header>
      <set-body>{"code":"OTP_REQUEST_TOO_LARGE"}</set-body></return-response>
  </when></choose>
</inbound><backend><base /></backend><outbound><base /><set-header name="Cache-Control" exists-action="override"><value>private, no-store</value></set-header></outbound><on-error><base /></on-error></policies>
'@
        $policy = @{ properties = @{ format = 'rawxml'; value = $xml } } | ConvertTo-Json -Depth 6
        Invoke-RestMethod -Uri "$operation/policies/policy?api-version=2022-08-01" -Method Put -Headers $headers -ContentType 'application/json' -Body $policy | Out-Null
        $readback = Invoke-RestMethod -Uri "$operation/policies/policy?api-version=2022-08-01" -Headers $headers
        if ($readback.properties.value -notmatch 'https://craves.in' -or $readback.properties.value -notmatch '1024') { throw 'OTP policy readback failed.' }
        Write-Output "Published only POST /api/v1/auth/otp/$action with body/CORS bounds; inherited policies retained. Shared send limits are backend-enforced."
    }
} finally { $token=$null; $headers=$null }
