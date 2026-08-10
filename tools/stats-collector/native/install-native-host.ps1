# Registers the native messaging host (CWS Stats Collector + Store Publisher)
# in Firefox. Run once from this directory:  .\install-native-host.ps1
#
# The native host manifest needs an absolute path to filereader.bat, which is
# machine-specific. Rather than commit that path, we generate the manifest here
# from the committed *.example.json template, then register it. The generated
# manifest is gitignored.
#
# RE-RUN THIS AFTER MOVING OR RENAMING THE REPO: the manifest and the registry
# value both point at the old location, and nothing else in the tools does.

$templatePath = Join-Path $PSScriptRoot "com.geminifoldersantigravity.filereader.example.json"
$manifestPath = Join-Path $PSScriptRoot "com.geminifoldersantigravity.filereader.json"
$batPath      = Join-Path $PSScriptRoot "filereader.bat"
$regKey = "HKCU:\Software\Mozilla\NativeMessagingHosts\com.geminifoldersantigravity.filereader"

# Generate the manifest from the template, injecting this machine's bat path.
$manifest = Get-Content $templatePath -Raw | ConvertFrom-Json
$manifest.path = $batPath
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

New-Item -Path $regKey -Force | Out-Null
Set-ItemProperty -Path $regKey -Name "(Default)" -Value $manifestPath

Write-Host "Generated and registered native messaging host."
Write-Host "  Manifest: $manifestPath"
Write-Host "  Host:     $batPath"
Write-Host ""
Write-Host "Verify Python is on PATH: $(python --version 2>&1)"
