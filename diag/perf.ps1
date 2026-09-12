# === PERFORMANCE OPTIMIZATION DIAGNOSTIC ===

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  PERFORMANCE DIAGNOSTIC" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# 1. POWER PLANS
Write-Host "`n===== [1] POWER PLAN DETAILS =====" -ForegroundColor Yellow
$active = powercfg /getactivescheme 2>&1
Write-Host $active
Write-Host ""
powercfg /query 54533251-82be-4824-96c1-47b60b740d00 PROCTHROTTLEMIN 2>&1
powercfg /query 54533251-82be-4824-96c1-47b60b740d00 PROCTHROTTLEMAX 2>&1
powercfg /query 54533251-82be-4824-96c1-47b60b740d00 CPMENABLED 2>&1

# 2. AMD POWER MANAGEMENT SETTINGS
Write-Host "`n===== [2] AMD SOFTWARE SETTINGS =====" -ForegroundColor Yellow
$amdReg = Get-ItemProperty 'HKLM:\SOFTWARE\AMD\Settings' -ErrorAction SilentlyContinue
if ($amdReg) { $amdReg | Format-List }
$amdSettings = Get-ItemProperty 'HKCU:\SOFTWARE\AMD\Settings' -ErrorAction SilentlyContinue
if ($amdSettings) { $amdSettings | Format-List }
# Check AMD GPU power profiles
Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{3d0f3032-767c-4415-8d81-beac15433a15}\0000' -ErrorAction SilentlyContinue | Select-Object * | Format-List
Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{3d0f3032-767c-4415-8d81-beac15433a15}\0001' -ErrorAction SilentlyContinue | Select-Object * | Format-List

# 3. MEMORY COMPRESSION
Write-Host "`n===== [3] MEMORY COMPRESSION =====" -ForegroundColor Yellow
try {
    $mc = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management' -ErrorAction SilentlyContinue
    Write-Host "MemoryCompression enabled: $($mc.MemoryCompression)"
} catch { Write-Host "Could not query memory compression" }
$os = Get-CimInstance Win32_OperatingSystem
Write-Host "Total Paging Files: $($os.TotalSwapSpaceSize)"
Write-Host "Free Swap Space: $([math]::Round($os.FreeSwapSpaceSize / 1MB / 1024, 1)) MB"

# 4. PAGE FILE
Write-Host "`n===== [4] PAGE FILE =====" -ForegroundColor Yellow
Get-CimInstance Win32_PageFileUsage | Format-List
Get-CimInstance Win32_PageFileSetting | Format-List

# 5. WSL2 HYPER-V OVERHEAD
Write-Host "`n===== [5] WSL2 / HYPER-V =====" -ForegroundColor Yellow
Get-CimInstance Win32_ComputerSystem | Select-Object HypervisorPresent | Format-List
try {
    $wsl = wsl --list --verbose 2>&1
    Write-Host $wsl
} catch { Write-Host "WSL query failed" }
# Count WSL processes
$wslProcs = Get-Process | Where-Object {$_.ProcessName -like '*wsl*' -or $_.ProcessName -like '*vmmem*'}
Write-Host "WSL-related processes: $($wslProcs.Count)"
$wslProcs | Select-Object ProcessName, Id, @{N='RAM_MB';E={[math]::Round($_.WorkingSet/1MB,1)}} | Format-Table -AutoSize

# 6. SERVICE OPTIMIZATION CANDIDATES
Write-Host "`n===== [6] AUTO-START SERVICES TO EVALUATE =====" -ForegroundColor Yellow
$servicesToCheck = @(
    'Spooler', 'SysMain', 'WSearch', 'WSearch', 'MapsBroker',
    'RemoteRegistry', 'TrkWks', 'Fax', 'XboxGipSvc', 'XblAuthManager',
    'XblGameSave', 'XboxNetApiSvc', 'BluRDFu', 'icssvc', 'MapsBroker',
    'WMPNetworkSvc', 'DusmSvc', 'ContentIndexer', 'PhoneSvc',
    'DeviceQueryBroker', 'DeviceUseBroker', 'LanmanWorkstation',
    'WerSvc', 'WbioSrvc', 'WcsPlugInsService', 'Wcncsvc'
)
foreach ($svc in $servicesToCheck) {
    $s = Get-CimInstance Win32_Service -Filter "Name='$svc'" -ErrorAction SilentlyContinue
    if ($s -and $s.State -eq 'Running') {
        Write-Host "  Running: $svc ($($s.StartMode))" -ForegroundColor Yellow
    }
}

# 7. SYSTEM BOOT PERFORMANCE
Write-Host "`n===== [7] BOOT PERFORMANCE =====" -ForegroundColor Yellow
try {
    Get-CimInstance Win32_PerfFormattedData_PerfOS_BootPerfStatistics | Select-Object * | Format-Table -AutoSize
} catch { Write-Host "Could not query boot stats" }

# 8. DISK I/O
Write-Host "`n===== [8] DISK I/O =====" -ForegroundColor Yellow
Get-Counter '\PhysicalDisk(*)\Avg. Disk Queue Length' -SampleInterval 1 -MaxSamples 2 2>&1 | Select-Object CounterSamples
Get-Counter '\PhysicalDisk(*)\% Idle Time' -SampleInterval 1 -MaxSamples 2 2>&1 | Select-Object CounterSamples

# 9. NETWORK ADAPTER OFFLOAD
Write-Host "`n===== [9] NETWORK OFFLOAD =====" -ForegroundColor Yellow
Get-NetAdapterAdvancedProperty -Name "Wi-Fi" -ErrorAction SilentlyContinue | Where-Object {$_.RegistryKeyword -like '*Offload*' -or $_.RegistryKeyword -like '*RSS*'} | Select-Object Name, RegistryKeyword, RegistryValue | Format-Table -AutoSize

# 10. CPU UTILIZATION SAMPLING
Write-Host "`n===== [10] CPU UTILIZATION (3 samples) =====" -ForegroundColor Yellow
Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 2 -MaxSamples 3 2>&1 | Select-Object CounterSamples
Get-Counter '\Processor(_Total)\% Privileged Time' -SampleInterval 2 -MaxSamples 3 2>&1 | Select-Object CounterSamples
Get-Counter '\Processor(_Total)\% User Time' -SampleInterval 2 -MaxSamples 3 2>&1 | Select-Object CounterSamples

# 11. CONTEXT SWITCHES / INTERRUPTS
Write-Host "`n===== [11] SYSTEM INTERRUPTS =====" -ForegroundColor Yellow
Get-Counter '\System\Context Switches/sec' -SampleInterval 1 -MaxSamples 2 2>&1 | Select-Object CounterSamples
Get-Counter '\Processor(_Total)\% Interrupt Time' -SampleInterval 2 -MaxSamples 2 2>&1 | Select-Object CounterSamples

# 12. GPU COMPUTATION
Write-Host "`n===== [12] GPU COMPUTE =====" -ForegroundColor Yellow
Get-Counter '\GPU Engine(*)\Utilization Percentage' -SampleInterval 1 -MaxSamples 2 2>&1 | Select-Object CounterSamples
Get-Counter '\GPU Process(*)\Utilization Percentage' -SampleInterval 1 -MaxSamples 2 2>&1 | Select-Object CounterSamples

# 13. PROCESS GOVERNOR DETAILS
Write-Host "`n===== [13] PROCESS LASSO =====" -ForegroundColor Yellow
Get-Process ProcessGovernor | Select-Object Id, ProcessName, WorkingSet, StartTime, Path | Format-List
# Check Process Lasso settings in registry
Get-ItemProperty 'HKLM:\SOFTWARE\Bitsum\ProcessGovernor' -ErrorAction SilentlyContinue | Format-List
Get-ItemProperty 'HKCU:\SOFTWARE\Bitsum\ProcessGovernor' -ErrorAction SilentlyContinue | Format-List
Get-ItemProperty 'HKLM:\SOFTWARE\Wow6432Node\Bitsum\ProcessGovernor' -ErrorAction SilentlyContinue | Format-List

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "  DIAGNOSTIC COMPLETE" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
