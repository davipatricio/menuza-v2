# === THERMAL & POWER DIAGNOSTIC ===
powershell -ExecutionPolicy Bypass -File $PSScriptRoot\collect.ps1

Write-Host ""
Write-Host "===== THERMAL / POWER / CPU BOOST =====" -ForegroundColor Yellow

# CPU boost status
Write-Host "`n--- CPU Boost Status ---" -ForegroundColor Cyan
powercfg /query SCHEME_MIN SUB_PROCESSOR PROCTHROTTLEMIN 2>$null
powercfg /query SCHEME_MIN SUB_PROCESSOR PROCTHROTTLEMAX 2>$null

# Current power plan details
Write-Host "`n--- Active Power Plan Details ---" -ForegroundColor Cyan
$activeScheme = powercfg /getactivescheme 2>$null
Write-Host $activeScheme

# Processor performance
Get-CimInstance Win32_Processor | ForEach-Object {
    Write-Host "Processor: $($_.Name)"
    Write-Host "  Max Clock: $($_.MaxClockSpeed) MHz"
    Write-Host "  Current Clock: $($_.CurrentClockSpeed) MHz"
    Write-Host "  Load: $($_.LoadPercentage)%"
    if ($_.MaxClockSpeed -gt 0 -and $_.CurrentClockSpeed -lt ($_.MaxClockSpeed * 0.8)) {
        Write-Host "  WARNING: CPU running below 80% of max clock - possible throttling!" -ForegroundColor Red
    }
}

# Thermal zone
Write-Host "`n--- Thermal Zones ---" -ForegroundColor Cyan
Get-CimInstance MSAcpi_ThermalZoneTemperature -Namespace root/WMI -ErrorAction SilentlyContinue | ForEach-Object {
    $tempC = $_.CurrentTemperature / 10 - 273.15
    Write-Host "$($_.InstanceName): $([math]::Round($tempC,1))°C"
    if ($tempC -gt 90) { Write-Host "  CRITICAL: Overheating!" -ForegroundColor Red }
    elseif ($tempC -gt 75) { Write-Host "  WARNING: High temperature" -ForegroundColor Yellow }
}

# Fan status
Write-Host "`n--- Fan Status ---" -ForegroundColor Cyan
Get-CimInstance Win32_Fan -ErrorAction SilentlyContinue | Select-Object Name, Status | Format-Table -AutoSize

# Disk health
Write-Host "`n--- Disk Health (SMART) ---" -ForegroundColor Cyan
Get-CimInstance Win32_DiskDrive | ForEach-Object {
    $health = Get-CimInstance Win32_DiskDrive -Filter "DeviceID='$($_.DeviceID)'" -ErrorAction SilentlyContinue
    Write-Host "$($_.Model): Status=$($_.Status)"
}

# Page file usage
Write-Host "`n--- Page File Usage ---" -ForegroundColor Cyan
Get-CimInstance Win32_PageFileUsage | Select-Object Name, AllocatedBaseSize, CurrentUsage, PeakUsage | Format-Table -AutoSize

Write-Host "`n===== HPET DETAILS =====" -ForegroundColor Yellow
# HPET check via registry
$hpet = Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Hardware Profiles\Current\System\MultiFunctionSerialBus\0\HPET" -ErrorAction SilentlyContinue
if ($hpet) {
    Write-Host "HPET registry entry found" -ForegroundColor Green
    $hpet | Format-List
} else {
    Write-Host "HPET registry entry NOT found - HPET may be disabled in BIOS" -ForegroundColor Yellow
}

# Check if HPET is in device manager
Write-Host "`n--- HPET in Device Tree ---" -ForegroundColor Cyan
Get-CimInstance Win32_PnPEntity | Where-Object {$_.Name -like '*HPET*' -or $_.Description -like '*HPET*'} | Select-Object Name, Description, Status | Format-Table -AutoSize
