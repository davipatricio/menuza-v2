# === QUICK SYSTEM HEALTH CHECK ===
# One-liner for fast overview

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "  QUICK SYSTEM HEALTH CHECK" -ForegroundColor Cyan
Write-Host "  $(Get-Date)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# System overview
$pc = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor
$ram = Get-CimInstance Win32_PhysicalMemory
$os = Get-CimInstance Win32_OperatingSystem

Write-Host "`n[SYSTEM]" -ForegroundColor Yellow
Write-Host "  Hostname:    $($pc.Name)"
Write-Host "  Model:       $($pc.Manufacturer) $($pc.Model)"
Write-Host "  Domain:      $($pc.Domain)"
Write-Host "  BIOS:        $(Get-CimInstance Win32_BIOS | Select-Object -ExpandProperty SMBIOSBIOSVersion)"
Write-Host "  Boot:        $($pc.BootupState)"

Write-Host "`n[CPU]" -ForegroundColor Yellow
Write-Host "  Model:       $($cpu.Name)"
Write-Host "  Cores/Threads: $($cpu.NumberOfCores)C / $($cpu.NumberOfLogicalProcessors)T"
Write-Host "  Max Clock:   $($cpu.MaxClockSpeed) MHz"
Write-Host "  Current:     $($cpu.CurrentClockSpeed) MHz"
Write-Host "  Load:        $($cpu.LoadPercentage)%"
if ($cpu.CurrentClockSpeed -lt ($cpu.MaxClockSpeed * 0.8)) {
    Write-Host "  ⚠ THROTTLING DETECTED!" -ForegroundColor Red
}

Write-Host "`n[RAM]" -ForegroundColor Yellow
$totalGB = [math]::Round($pc.TotalPhysicalMemory / 1GB, 1)
$freeGB = [math]::Round($os.FreePhysicalMemory / 1MB / 1024, 1)
Write-Host "  Total:       ${totalGB}GB"
Write-Host "  Free:        ${freeGB}GB"
Write-Host "  Used:        $([math]::Round(($totalGB - $freeGB) / $totalGB * 100))%"
$banks = ($ram | Measure-Object).Count
Write-Host "  Banks:       $banks"
foreach ($b in $ram) {
    $sizeGB = [math]::Round($b.Capacity / 1GB, 1)
    Write-Host "    $($b.BankLabel): ${sizeGB}GB @ $($b.Speed)MHz ($($b.Manufacturer))"
}

Write-Host "`n[STORAGE]" -ForegroundColor Yellow
Get-CimInstance Win32_LogicalDisk | ForEach-Object {
    $size = [math]::Round($_.Size / 1GB, 1)
    $free = [math]::Round($_.FreeSpace / 1GB, 1)
    $used = [math]::Round(($_.Used / $_.Size) * 100)
    Write-Host "  $($_.DeviceID): ${size}GB ($used% used, ${free}GB free) [$($_.FileSystem)]"
}

Write-Host "`n[GPU]" -ForegroundColor Yellow
Get-CimInstance Win32_VideoController | ForEach-Object {
    Write-Host "  $($_.Name)"
    Write-Host "    Driver: $($_.DriverVersion) ($($_.DriverDate))"
    Write-Host "    VRAM: $([math]::Round($_.AdapterRAM / 1MB, 0))MB"
    Write-Host "    Resolution: $($_.VideoModeDescription)"
}

Write-Host "`n[DEFENDER]" -ForegroundColor Yellow
try {
    $d = Get-MpComputerStatus
    $status = if ($d.AntivirusEnabled) { "✓ ON" } else { "✗ OFF" -ForegroundColor RED }
    Write-Host "  Antivirus:      $status"
    Write-Host "  Real-time:      $(if ($d.RealTimeProtectionEnabled) {'✓ ON'} else {'✗ OFF'})"
    Write-Host "  Behavior Monitor: $(if ($d.BehaviorMonitorEnabled) {'✓ ON'} else {'✗ OFF'})"
} catch {
    Write-Host "  Defender not accessible" -ForegroundColor Yellow
}

Write-Host "`n[TOP PROCESSES BY RAM]" -ForegroundColor Yellow
Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10 Id, ProcessName, @{N='RAM_MB';E={[math]::Round($_.WorkingSet/1MB,1)}} | Format-Table -AutoSize

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "  CHECK COMPLETE" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
