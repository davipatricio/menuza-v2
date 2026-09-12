# === SYSTEM DIAGNOSTIC SCRIPT ===
# Run with: powershell -ExecutionPolicy Bypass -File collect.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  WINDOWS SYSTEM DIAGNOSTIC REPORT" -ForegroundColor Cyan
Write-Host "  Generated: $(Get-Date)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# --- 1. SYSTEM INFO ---
Write-Host "`n===== [1] SYSTEM INFO =====" -ForegroundColor Yellow
Get-CimInstance Win32_ComputerSystem | Select-Object Name, Domain, Manufacturer, Model, TotalPhysicalMemory, BootupState | Format-List
Get-CimInstance Win32_BIOS | Select-Object Manufacturer, SMBIOSBIOSVersion, ReleaseDate, SerialNumber, Version | Format-List
Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product, SerialNumber, Version | Format-List

# --- 2. CPU ---
Write-Host "`n===== [2] CPU =====" -ForegroundColor Yellow
Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, CurrentClockSpeed, L2CacheSize, L3CacheSize, LoadPercentage | Format-List

# --- 3. RAM ---
Write-Host "`n===== [3] MEMORY (RAM) =====" -ForegroundColor Yellow
Get-CimInstance Win32_PhysicalMemory | Select-Object BankLabel, Capacity, Speed, Manufacturer, PartNumber | Format-Table -AutoSize
$os = Get-CimInstance Win32_OperatingSystem
$osFree = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
$osTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
Write-Host "OS Free RAM: $osFree GB / Total: $osTotal GB" -ForegroundColor Green

# --- 4. STORAGE ---
Write-Host "`n===== [4] STORAGE =====" -ForegroundColor Yellow
Get-CimInstance Win32_DiskDrive | Select-Object Model, InterfaceType, MediaType, Size, Status | Format-Table -AutoSize
Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, DriveType, FileSystem, @{N='SizeGB';E={[math]::Round($_.Size/1GB,1)}}, @{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB,1)}}, @{N='Used%';E={if($_.Size){[math]::Round(($_.Used/$_.Size)*100,1)}else{'N/A'}}} | Format-Table -AutoSize

# --- 5. GPU ---
Write-Host "`n===== [5] GPU =====" -ForegroundColor Yellow
Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, DriverDate, AdapterRAM, VideoModeDescription, Status | Format-List
Get-CimInstance Win32_DisplayConfiguration | Select-Object DeviceName, BitsPerPel, PelsWidth, PelsHeight | Format-Table -AutoSize

# --- 6. NETWORK ---
Write-Host "`n===== [6] NETWORK ADAPTERS =====" -ForegroundColor Yellow
Get-CimInstance Win32_NetworkAdapter | Where-Object {$_.PhysicalAdapter -eq $true} | Select-Object Name, NetConnectionID, MACAddress, Speed, Status, DriverVersion | Format-Table -AutoSize -Wrap
Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object {$_.IPEnabled -eq $true} | Select-Object Description, IPAddress, IPSubnet, DefaultIPGateway, DNSServerSearchOrder | Format-Table -AutoSize -Wrap

# --- 7. RUNNING PROCESSES ---
Write-Host "`n===== [7] TOP PROCESSES (by RAM) =====" -ForegroundColor Yellow
Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 25 Id, ProcessName, @{N='RAM_MB';E={[math]::Round($_.WorkingSet/1MB,1)}} | Format-Table -AutoSize

# --- 8. INSTALLED APPS ---
Write-Host "`n===== [8] INSTALLED APPLICATIONS =====" -ForegroundColor Yellow
$apps = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Sort-Object DisplayName
$apps += Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Sort-Object DisplayName
$apps | Select-Object DisplayName, DisplayVersion, Publisher, InstallDate | Sort-Object DisplayName | Format-Table -AutoSize -Wrap

# --- 9. WINDOWS DEFENDER ---
Write-Host "`n===== [9] WINDOWS DEFENDER STATUS =====" -ForegroundColor Yellow
try {
    $defender = Get-MpComputerStatus
    $prefs = Get-MpPreference
    Write-Host "AntivirusEnabled:              $($defender.AntivirusEnabled)" -ForegroundColor $(if($defender.AntivirusEnabled){'Green'}else{'RED'})
    Write-Host "AntispywareEnabled:            $($defender.AntispywareEnabled)" -ForegroundColor $(if($defender.AntispywareEnabled){'Green'}else{'RED'})
    Write-Host "RealTimeProtectionEnabled:     $($defender.RealTimeProtectionEnabled)" -ForegroundColor $(if($defender.RealTimeProtectionEnabled){'Green'}else{'RED'})
    Write-Host "IoavProtectionEnabled:         $($defender.IoavProtectionEnabled)" -ForegroundColor $(if($defender.IoavProtectionEnabled){'Green'}else{'RED'})
    Write-Host "BehaviorMonitorEnabled:        $($defender.BehaviorMonitorEnabled)" -ForegroundColor $(if($defender.BehaviorMonitorEnabled){'Green'}else{'RED'})
    Write-Host "AntivirusSignatureLastUpdated: $($defender.AntivirusSignatureLastUpdated)"
    Write-Host "FullScanAge:                   $($defender.FullScanAge)"
    Write-Host "QuickScanAge:                  $($defender.QuickScanAge)"
    Write-Host "AntivirusSignatureVersion:     $($defender.AntivirusSignatureVersion)"
    Write-Host "`nDisableRealtimeMonitoring:      $($prefs.DisableRealtimeMonitoring)"
    Write-Host "DisableBehaviorMonitoring:     $($prefs.DisableBehaviorMonitoring)"
    Write-Host "DisableScanOnRealtimeEnable:   $($prefs.DisableScanOnRealtimeEnable)"
} catch {
    Write-Host "Windows Defender not accessible or not installed." -ForegroundColor Red
}

# --- 10. POWER PLAN ---
Write-Host "`n===== [10] POWER PLAN =====" -ForegroundColor Yellow
powercfg /getactivescheme
powercfg /query SCHEME_MIN SUB_PROCESSOR PROCTHROTTLEMIN
powercfg /query SCHEME_MIN SUB_PROCESSOR PROCTHROTTLEMAX

# --- 11. HPET ---
Write-Host "`n===== [11] HPET =====" -ForegroundColor Yellow
Get-CimInstance Win32_DeviceInterface | Where-Object {$_.DeviceID -like '*HPET*'} | Select-Object DeviceID, Name | Format-Table -AutoSize
Get-CimInstance Win32_Timer | Where-Object {$_.Name -like '*HPET*'} | Select-Object Name, Resolution, Accuracy | Format-Table -AutoSize

# --- 12. DRIVERS (UNSIGNED) ---
Write-Host "`n===== [12] DRIVER INFORMATION =====" -ForegroundColor Yellow
Get-CimInstance Win32_PnPSignedDriver | Where-Object {$_.IsSigned -eq $false -and $_.DeviceName} | Select-Object DeviceName, DriverVersion, IsSigned, InfName | Format-Table -AutoSize -Wrap

# --- 13. WINDOWS FEATURES ---
Write-Host "`n===== [13] WINDOWS FEATURES =====" -ForegroundColor Yellow
DISM /Online /Get-Features /Format:Table 2>$null | Select-Object -First 30

# --- 14. AUTOSTART / SERVICES ---
Write-Host "`n===== [14] AUTOSTART ITEMS =====" -ForegroundColor Yellow
Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location | Format-Table -AutoSize -Wrap
Get-CimInstance Win32_Service | Where-Object {$_.StartMode -eq 'Auto' -and $_.State -eq 'Running'} | Select-Object Name, State, StartMode | Format-Table -AutoSize -Wrap

# --- 15. EVENT LOG ERRORS ---
Write-Host "`n===== [15] RECENT SYSTEM ERRORS =====" -ForegroundColor Yellow
Get-WinEvent -FilterHashtable @{LogName='System'; Level=2} -MaxEvents 20 -ErrorAction SilentlyContinue | Select-Object TimeCreated, Id, ProviderName, Message | Format-Table -AutoSize -Wrap

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "  DIAGNOSTIC COMPLETE" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
