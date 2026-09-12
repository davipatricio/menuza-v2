# === SUGGESTED FIXES (REVIEW BEFORE APPLYING) ===
# Each section is commented out. Uncomment and review before running.

Write-Host "This file contains SUGGESTED commands only. Nothing is applied." -ForegroundColor Yellow
Write-Host "Review each section, uncomment, and run individually." -ForegroundColor Yellow
Write-Host ""

<#
# === 1. ENABLE WINDOWS DEFENDER ===
Write-Host "Enabling Windows Defender..." -ForegroundColor Green
Set-MpPreference -DisableRealtimeMonitoring $false
Set-MpPreference -DisableBehaviorMonitoring $false
Set-MpPreference -DisableScanOnRealtimeEnable $false
Set-MpPreference -DisableBlockAtFirstSeen $false
Update-MpSignature
Write-Host "Defender enabled. Signatures updating..." -ForegroundColor Green
#>

<#
# === 2. ENABLE UAC ===
Write-Host "Enabling UAC..." -ForegroundColor Green
# Set registry key
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" -Name "EnableLUA" -Value 1
# Requires restart
Write-Host "UAC enabled. RESTART REQUIRED." -ForegroundColor Yellow
#>

<#
# === 3. SWITCH TO BALANCED POWER PLAN ===
Write-Host "Switching to Windows Balanced power plan..." -ForegroundColor Green
powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e
Write-Host "Power plan switched to Balanced. Check if CPU boosts." -ForegroundColor Green
#>

<#
# === 4. INCREASE SHADOW COPY STORAGE ===
Write-Host "Increasing shadow copy storage on C:..." -ForegroundColor Green
# Open System Properties → System Protection → Configure → Set to 10% or unlimited
# Command line alternative (requires admin):
# vssadmin resize shadowstorage /For=C: /On=C: /MaxSize=10GB
#>

<#
# === 5. DISABLE HYPER-V (if not needed) ===
Write-Host "Disabling Hyper-V..." -ForegroundColor Yellow
# Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All
# Requires restart
Write-Host "Hyper-V disabled. RESTART REQUIRED." -ForegroundColor Yellow
#>

<#
# === 6. DISABLE UNAUTOMATIC STARTUP ITEMS ===
Write-Host "Reviewing startup items..." -ForegroundColor Yellow
# Remove from Task Manager → Startup tab:
# - Podman Desktop (if not always needed)
# - BraveSoftware Update (Brave manages its own updates)
# - ElevocService (unknown service - research before removing)
#>

<#
# === 7. CLEAN UP C: DRIVE ===
Write-Host "Disk cleanup suggestions for C:..." -ForegroundColor Yellow
# Run disk cleanup:
# cleanmgr /d C:
# Or delete temp files:
# Remove-Item -Path $env:TEMP\* -Recurse -Force -ErrorAction SilentlyContinue
# Remove Windows update cleanup:
# DISM /Online /Cleanup-Image /StartComponentCleanup
#>

<#
# === 8. UPDATE GPU DRIVER ===
Write-Host "GPU driver check..." -ForegroundColor Yellow
# Open AMD Software → Check for Updates
# Or use command line:
# amdsettings.exe (if available)
# Or download from https://www.amd.com/en/support
#>

<#
# === 9. REDUCE RUNNING INSTANCES ===
Write-Host "Killing excess instances..." -ForegroundColor Yellow
# Get-Process brave | Where-Object {$_.Id -ne (Get-Process brave | Sort-Object Id | Select-Object -First 1).Id} | Stop-Process
# Get-Process Orca | Where-Object {$_.Id -ne (Get-Process Orca | Sort-Object Id | Select-Object -First 1).Id} | Stop-Process
# WARNING: Only if you have closed all important work in these apps
#>

Write-Host ""
Write-Host "All commands are COMMENTED OUT. Review and uncomment individually." -ForegroundColor Cyan
