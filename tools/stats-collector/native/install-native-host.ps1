# Registers the CWS Stats Collector native messaging host in Firefox.
# Run once from this directory:  .\install-native-host.ps1

$manifestPath = Join-Path $PSScriptRoot "com.geminifoldersantigravity.filereader.json"
$regKey = "HKCU:\Software\Mozilla\NativeMessagingHosts\com.geminifoldersantigravity.filereader"

New-Item -Path $regKey -Force | Out-Null
Set-ItemProperty -Path $regKey -Name "(Default)" -Value $manifestPath

Write-Host "Registered native messaging host."
Write-Host "  Manifest: $manifestPath"
Write-Host ""
Write-Host "Verify Python is on PATH: $(python --version 2>&1)"
