param([string]$BaseUrl = 'https://craves.in')
$ErrorActionPreference = 'Stop'
$base = [uri]$BaseUrl
if ($base.Scheme -ne 'https' -or $base.Host -ne 'craves.in') { throw 'This check is restricted to the existing public Craves site.' }
$checks = @()
try {
    foreach ($platform in @('legacy', 'mobile', 'web')) {
        $query = if ($platform -eq 'legacy') { '' } else { "?platform=$platform" }
        $config = Invoke-RestMethod -Uri "$($base.AbsoluteUri.TrimEnd('/'))/api/auth/otp-config$query" `
            -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 20
        if ($config.provider -ne 'msg91' -or !$config.widgetId -or !$config.tokenAuth) { throw 'OTP configuration is incomplete.' }
        $url = 'https://control.msg91.com/api/v5/widget/getWidgetProcess?widgetId=' +
            [uri]::EscapeDataString($config.widgetId) + '&tokenAuth=' + [uri]::EscapeDataString($config.tokenAuth)
        $policy = Invoke-RestMethod -Uri $url -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 20
        $expected = if ($platform -eq 'web') { 0 } else { 1 }
        if ($policy.status -ne 'success' -or $policy.hasError -or $policy.data.status.value -ne '1' -or
            $policy.data.mobileIntegration -ne $expected -or $policy.data.otpLength -ne 6 -or $policy.data.invisible -ne 0) {
            throw "The $platform widget is disabled or incompatible. No SMS was sent."
        }
        $checks += [pscustomobject]@{
            platform = $platform; widgetId = $config.widgetId
            mobileIntegration = $policy.data.mobileIntegration; captcha = $policy.data.captchaValidations
            otpLength = $policy.data.otpLength; retryTime = $policy.data.retryTime
            retryCount = $policy.data.retryCount; expiryTime = $policy.data.expiryTime
        }
    }
    if ($checks[0].widgetId -ne $checks[1].widgetId -or $checks[0].widgetId -eq $checks[2].widgetId) {
        throw 'Platforms are not independent or the legacy mobile contract changed.'
    }
    [pscustomobject]@{ checkedAtUtc = [DateTimeOffset]::UtcNow.ToString('o'); checks = $checks } | ConvertTo-Json -Depth 5
} catch {
    throw 'Dual-platform OTP configuration verification failed. No OTP or server credentials were used.'
} finally {
    $config = $null; $policy = $null; $url = $null
}
