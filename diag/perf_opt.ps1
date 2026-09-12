# === PERFORMANCE OPTIMIZATION COMMANDS ===
# REVIEW EACH SECTION BEFORE APPLYING
# NOTHING IS APPLIED YET - THESE ARE SUGGESTED COMMANDS ONLY

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  PERFORMANCE OPTIMIZATION COMMANDS" -ForegroundColor Cyan
Write-Host "  REVIEW BEFORE APPLYING" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

<#
# ===== OPTION A: WSL2 MEMORY LIMIT (.wslconfig) =====
Write-Host ""
Write-Host "[1] CREATING .wslconfig FOR WSL2 MEMORY LIMIT" -ForegroundColor Yellow
# Creates C:\Users\davip\.wslconfig with 4GB RAM cap and 4 CPU limit
$wslConfig = @"
[wsl2]
memory=4GB
processors=4
swap=0
localhostForwarding=true
"@
# Uncomment to create:
# Set-Content -Path "$env:USERPROFILE\.wslconfig" -Value $wslConfig -Force
Write-Host "  Would create .wslconfig with: memory=4GB, processors=4, swap=0"
Write-Host "  After creating, RESTART WSL2: wsl --shutdown"
#>

<#
# ===== OPTION B: FULL WSL2 SHUTDOWN =====
Write-Host ""
Write-Host "[2] SHUT DOWN WSL2 (frees ~8GB RAM + CPU)" -ForegroundColor Yellow
# wsl --shutdown
# This terminates ALL WSL instances instantly
Write-Host "  Run: wsl --shutdown" -ForegroundColor White
Write-Host "  Effect: Frees ~8GB RAM, 25 processes terminated" -ForegroundColor White
#>

<#
# ===== OPTION C: DISABLE SYSMAIN (SuperFetch) =====
Write-Host ""
Write-Host "[3] DISABLE SYSMAIN" -ForegroundColor Yellow
# On NVMe SSD with 18.8GB RAM, SuperFetch provides minimal benefit
# It competes for disk I/O and RAM
Write-Host "  Run: Stop-Service SysMain -Force" -ForegroundColor White
Write-Host "  Run: Set-Service SysMain -StartupType Disabled" -ForegroundColor White
# Uncomment to apply:
# Stop-Service SysMain -Force
# Set-Service SysMain -StartupType Disabled
#>

<#
# ===== OPTION D: DISABLE WINDOWS SEARCH =====
Write-Host ""
Write-Host "[4] DISABLE WINDOWS SEARCH (WSearch)" -ForegroundColor Yellow
# Uses CPU + disk I/O for indexing
Write-Host "  Run: Stop-Service WSearch -Force" -ForegroundColor White
Write-Host "  Run: Set-Service WSearch -StartupType Manual" -ForegroundColor White
# Uncomment to apply:
# Stop-Service WSearch -Force
# Set-Service WSearch -StartupType Manual
#>

<#
# ===== OPTION E: EXPAND PAGE FILE =====
Write-Host ""
Write-Host "[5] EXPAND PAGE FILE TO 16GB" -ForegroundColor Yellow
# Current: 9995 MB on C: (NVMe)
# With 67% committed bytes, page file is being used
# Increasing prevents page file thrashing
Write-Host "  Run: wmic pagefileset where name=`"C:\pagefile.sys`" set InitialSize=4096,MaximumSize=16384" -ForegroundColor White
# Uncomment to apply (requires restart):
# wmic pagefileset where "name='C:\\pagefile.sys'" set InitialSize=4096,MaximumSize=16384
# OR move to D: drive:
# wmic pagefileset where "name='C:\\pagefile.sys'" delete
# wmic pagefileset where "name='D:\\pagefile.sys'" create InitialSize=4096,MaximumSize=16384
#>

<#
# ===== OPTION F: POWER PLAN TWEAK =====
Write-Host ""
Write-Host "[6] ADJUST POWER PLAN FOR BETTER CPU IDLING" -ForegroundColor Yellow
# Current: Bitsum Highest Performance
# AC min processor state: 100% (keeps CPU warm)
# Changing to 5% allows deeper C-states = less heat + power
Write-Host "  Run: powercfg /setacvalueindex SCHEME_MIN SUB_PROCESSOR PROCTHROTTLEMIN 5" -ForegroundColor White
Write-Host "  This allows CPU to idle deeper between bursts" -ForegroundColor White
# Uncomment to apply:
# powercfg /setacvalueindex SCHEME_MIN SUB_PROCESSOR PROCTHROTTLEMIN 5
# powercfg /setactive 6fc231ee-95f3-45b0-9d93-1d9ebcbd5170
#>

<#
# ===== OPTION G: ENABLE MEMORY COMPRESSION =====
Write-Host ""
Write-Host "[7] ENABLE MEMORY COMPRESSION" -ForegroundColor Yellow
# Windows 11 enables this by default, but let's verify
# Compresses RAM pages instead of paging to disk
# Benefit on systems with limited RAM
$mc = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management' -ErrorAction SilentlyContinue
Write-Host "  Current MemoryCompression setting: $($mc.MemoryCompression)"
Write-Host "  If not present, enable with: Enable-MemoryCompression" -ForegroundColor White
#>

<#
# ===== OPTION H: AMD SOFTWARE POWER SETTINGS =====
Write-Host ""
Write-Host "[8] AMD SOFTWARE POWER MANAGEMENT CHECK" -ForegroundColor Yellow
# Open AMD Software and check:
# - Gaming > Power > Set to 'AMD Optimized' or 'Maximum Performance'
# - Disable Radeon Chill if not gaming
# - Disable Radeon Anti-Lag if not gaming
# - Check: Settings > GPU > Power Control Mode
# These may override Windows power plans and limit CPU boost

# Check AMD driver power settings in registry:
Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{3d0f3032-767c-4415-8d81-beac15433a15}\0000\PowerSettings' -ErrorAction SilentlyContinue | Format-List
Get-ItemProperty 'HKCU:\SOFTWARE\AMD\Settings\Global\Power' -ErrorAction SilentlyContinue | Format-List
#>

<#
# ===== OPTION I: PROCESS LASSO CONFIGURATION =====
Write-Host ""
Write-Host "[9] PROCESS LASSO PERFORMANCE SETTINGS" -ForegroundColor Yellow
# Open Process Lasso GUI and configure:
# - Enable ProBalance (CPU scheduling optimization)
# - Enable CPU Optimization
# - Set Brave.exe and Orca.exe to Performance Mode
# - Set process priority for Orca to High
# - Disable "Screen Saver Mode" if always-on PC
# - Set Process Lasso service to start with Windows

# Check Process Lasso settings file:
$plSettings = Get-ChildItem "$env:APPDATA\Bitsum\Process Lasso" -Recurse -ErrorAction SilentlyContinue
Write-Host "  Process Lasso settings found: $($plSettings.Count) items"
#>

<#
# ===== OPTION J: NETWORK OFFLOAD OPTIMIZATION =====
Write-Host ""
Write-Host "[10] NETWORK OFFLOAD SETTINGS" -ForegroundColor Yellow
# Check if disabling offloads saves CPU
Get-NetAdapterAdvancedProperty -Name "Wi-Fi" -ErrorAction SilentlyContinue | 
    Where-Object {$_.RegistryKeyword -like '*Offload*' -or $_.RegistryKeyword -like '*RSS*'} |
    Format-Table Name, RegistryKeyword, RegistryValue, DefaultValue
Write-Host "  Consider disabling if CPU-bound:" -ForegroundColor White
Write-Host "    - RX Checksum Offload" -ForegroundColor White
Write-Host "    - TX Checksum Offload" -ForegroundColor White
Write-Host "    - Large Send Offload (LSO)" -ForegroundColor White
Write-Host "    - RSS (Receive Side Scaling)" -ForegroundColor White
#>

<#
# ===== OPTION K: TSC SYNC FIX =====
Write-Host ""
Write-Host "[11] HYPER-V TSC SYNC FIX" -ForegroundColor Yellow
# Event ID 154: Hypervisor failed to properly synchronize TSC
# Add kernel command line parameter to WSL2
Write-Host "  Add to .wslconfig:" -ForegroundColor White
Write-Host "    [wsl2]" -ForegroundColor White
Write-Host "    kernelCommandLine = `"tsc=reliable`"" -ForegroundColor White
# Or disable Hyper-V entirely if WSL2 not needed:
# Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All
# (Requires restart)
#>

<#
# ===== OPTION L: UNNECESSARY SERVICE DISABLE =====
Write-Host ""
Write-Host "[12] SERVICES TO EVALUATE FOR DISABLING" -ForegroundColor Yellow
$services = @(
    'ElevocService',    # Unknown - investigate
    'l1vhlwf',          # Unknown - investigate
    'webthreatdefusersvc', # Unknown - likely McAfee/web threat
    'MapsBroker',       # Offline Maps
    'BluRDFu',          # Bluetooth
    'XboxGipSvc',       # Xbox services
    'XblAuthManager',   # Xbox auth
    'XblGameSave',      # Xbox game save
    'XboxNetApiSvc',    # Xbox networking
    'WMPNetworkSvc',    # Windows Media Player sharing
    'RemoteRegistry',   # Remote registry access
    'Fax',              # Fax service
    'TrkWks',           # Link tracking (if not needed)
    'WSearch',          # Already disabled above
    'SysMain',          # Already disabled above
    'cbdhsvc_31d439',   # Unknown
    'CDPUserSvc_31d439', # Connected Devices Platform
)

Write-Host "  Review these services - many can be disabled:" -ForegroundColor White
foreach ($svc in $services) {
    $s = Get-CimInstance Win32_Service -Filter "Name='$svc'" -ErrorAction SilentlyContinue
    if ($s) {
        Write-Host "    $svc : $($s.State) / $($s.StartMode) / $($s.Description)" -ForegroundColor White
    }
}
#>

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  REVIEW COMPLETE - NOTHING APPLIED" -ForegroundColor Cyan
Write-Host "  To apply, uncomment sections and run as admin" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
