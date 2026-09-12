# === KEY ISSUE VERIFICATION SCRIPT ===

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  QUICK VERIFICATION CHECKLIST" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Defender
Write-Host "`n[1] DEFENDER STATUS" -ForegroundColor Yellow
try {
    $d = Get-MpComputerStatus -ErrorAction Stop
    Write-Host "  Real-time Protection: $(if ($d.RealTimeProtectionEnabled) {'ON'} else {'OFF'})"
    Write-Host "  Antivirus: $(if ($d.AntivirusEnabled) {'ON'} else {'OFF'})"
    Write-Host "  Behavior Monitor: $(if ($d.BehaviorMonitorEnabled) {'ON'} else {'OFF'})"
    if (-not $d.AntivirusEnabled) { Write-Host "  *** CRITICAL: Defender is OFF ***" -ForegroundColor Red }
} catch {
    Write-Host "  Cannot query Defender" -ForegroundColor Red
}

# 2. CPU Boost
Write-Host "`n[2] CPU BOOST CHECK" -ForegroundColor Yellow
$cpu = Get-CimInstance Win32_Processor
$ratio = $cpu.CurrentClockSpeed / $cpu.MaxClockSpeed
Write-Host "  Base: $($cpu.MaxClockSpeed) MHz"
Write-Host "  Current: $($cpu.CurrentClockSpeed) MHz"
Write-Host "  Ratio: $([math]::Round($ratio * 100))%"
if ($cpu.CurrentClockSpeed -lt ($cpu.MaxClockSpeed * 0.8)) {
    Write-Host "  *** CPU NOT BOOSTING - Investigate AMD power management ***" -ForegroundColor Red
} else {
    Write-Host "  CPU boosting normally" -ForegroundColor Green
}

# 3. RAM
Write-Host "`n[3] RAM CHECK" -ForegroundColor Yellow
$os = Get-CimInstance Win32_OperatingSystem
$free = [math]::Round($os.FreePhysicalMemory / 1024 / 1024, 1)
$total = [math]::Round($os.TotalVisibleMemorySize / 1024 / 1024, 1)
$pctUsed = [math]::Round(($total - $free) / $total * 100)
Write-Host "  Total: ${total}GB | Free: ${free}GB | Used: ${pctUsed}% "
if ($pctUsed -gt 85) { Write-Host "  *** High RAM usage ***" -ForegroundColor Yellow }

# 4. Disk C:
Write-Host "`n[4] DISK C: CHECK" -ForegroundColor Yellow
$disc = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$freeGB = [math]::Round($disc.FreeSpace / 1GB, 1)
$sizeGB = [math]::Round($disc.Size / 1GB, 1)
$pctUsedDisk = [math]::Round(($disc.Used / $disc.Size) * 100)
Write-Host "  Size: ${sizeGB}GB | Free: ${freeGB}GB | Used: ${pctUsedDisk}% "
if ($pctUsedDisk -gt 80) { Write-Host "  *** C: drive nearly full ***" -ForegroundColor Red }

# 5. Hyper-V
Write-Host "`n[5] HYPER-V STATUS" -ForegroundColor Yellow
try {
    $hv = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -ErrorAction Stop
    Write-Host "  State: $($hv.State)"
    if ($hv.State -eq "Enabled") { Write-Host "  *** Hyper-V enabled (may cause TSC sync issues) ***" -ForegroundColor Yellow }
    else { Write-Host "  Hyper-V disabled" -ForegroundColor Green }
} catch {
    Write-Host "  Could not query Hyper-V feature status" -ForegroundColor Yellow
}

# 6. Suspicious services
Write-Host "`n[6] SUSPICIOUS SERVICES" -ForegroundColor Yellow
$suspicious = @('ElevocService', 'l1vhlwf', 'webthreatdefusersvc')
foreach ($svc in $suspicious) {
    $s = Get-CimInstance Win32_Service -Filter "Name='$svc'" -ErrorAction SilentlyContinue
    if ($s) { Write-Host "  Warning: $svc is Running ($($s.State))" -ForegroundColor Yellow }
}

# 7. Process count
Write-Host "`n[7] PROCESS COUNT" -ForegroundColor Yellow
$procs = Get-Process
Write-Host "  Total processes: $($procs.Count)"
$brave = ($procs | Where-Object {$_.ProcessName -eq 'brave'}).Count
$orca = ($procs | Where-Object {$_.ProcessName -eq 'Orca'}).Count
Write-Host "  Brave instances: $brave"
Write-Host "  Orca instances: $orca"
if ($brave -gt 3 -or $orca -gt 2) { Write-Host "  *** Too many browser/IDE instances ***" -ForegroundColor Yellow }

# 8. UAC
Write-Host "`n[8] UAC STATUS" -ForegroundColor Yellow
try {
    $uac = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -ErrorAction Stop
    $consent = $uac.EnableLUA
    Write-Host "  EnableLUA: $(if ($consent) {'ON'} else {'OFF'})"
    if (-not $consent) { Write-Host "  *** UAC disabled - no privilege escalation barrier ***" -ForegroundColor Red }
} catch {
    Write-Host "  Could not query UAC registry" -ForegroundColor Yellow
}

# 9. Boot performance
Write-Host "`n[9] BOOT PERFORMANCE" -ForegroundColor Yellow
try {
    $boot = Get-CimInstance Win32_PerfFormattedData_PerfOS_System | Select-Object SystemUpTime
    Write-Host "  Uptime: $($boot.SystemUpTime) seconds"
} catch {
    Write-Host "  Could not query uptime" -ForegroundColor Yellow
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "  Review issues above. No changes applied." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
