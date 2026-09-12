# === DISABLE SERVICES SCRIPT ===
# Run with: powershell -ExecutionPolicy Bypass -File disable_services.ps1

$svcNames = @(
    "WSearch",
    "SysMain",
    "AMD Crash Defender Service",
    "ElevocService",
    "webthreatdefusersvc_31d439",
    "WinDefend",
    "LITSSVC",
    "DolbyDAXAPI",
    "LenovoFnAndFunctionKeys"
)

Write-Host ""
Write-Host "============================================" -ForegroundColor Red
Write-Host "  DISABLING SERVICES" -ForegroundColor Red
Write-Host "============================================" -ForegroundColor Red

foreach ($name in $svcNames) {
    try {
        $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
        if ($svc) {
            # Stop the service
            Stop-Service -Name $name -Force -ErrorAction SilentlyContinue
            # Disable startup
            Set-Service -Name $name -StartupType Disabled -ErrorAction SilentlyContinue
            $newStatus = Get-Service -Name $name -ErrorAction SilentlyContinue
            Write-Host "  $name: Stopped -> Disabled (was $($svc.Status)/$($svc.StartType))" -ForegroundColor Green
        } else {
            Write-Host "  $name: NOT FOUND" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  $name: ERROR - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Red
Write-Host "  VERIFICATION" -ForegroundColor Red
Write-Host "============================================" -ForegroundColor Red
Get-Service -Name $svcNames | Select-Object Name, Status, StartType | Format-Table -AutoSize -Wrap
Write-Host ""

# Also disable the WSearch startup in registry for extra measure
reg delete "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "WSearch" /f 2>nul
reg delete "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce" /v "WSearch" /f 2>nul

Write-Host "Done. Some services may need a reboot to fully stop." -ForegroundColor Yellow
Write-Host "Run 'wsl --shutdown' and reboot at end of day." -ForegroundColor Yellow
