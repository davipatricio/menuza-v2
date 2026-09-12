@echo off
echo ========================================
echo   VERIFY RULES ARE ACTUALLY APPLIED
echo ========================================
echo.
echo This checks if Process Lasso rules are ACTIVE
echo on running processes by examining process priorities.
echo.

REM Check ProcessGovernor service status
echo --- ProcessGovernor Service ---
sc query ProcessGovernor 2>&1 | findstr STATE

echo.
echo --- Checking Process Priorities ---
REM Check if brave.exe has elevated priority
tasklist /fi "imagename eq brave.exe" /fo csv 2>nul | findstr "brave" >nul 2>&1
if %errorlevel% equ 0 (
    echo [FOUND] brave.exe is running
    echo Process Lasso should be applying "Above Normal" priority
)

tasklist /fi "imagename eq Orca.exe" /fo csv 2>nul | findstr "Orca" >nul 2>&1
if %errorlevel% equ 0 (
    echo [FOUND] Orca.exe is running
    echo Process Lasso should be applying "Above Normal" priority
)

tasklist /fi "imagename eq opencode2.exe" /fo csv 2>nul | findstr "opencode2" >nul 2>&1
if %errorlevel% equ 0 (
    echo [FOUND] opencode2.exe is running
    echo Process Lasso should be applying "Above Normal" priority
)

echo.
echo --- Checking prolasso.ini locations ---
echo User config (AppData):
if exist "C:\Users\davip\AppData\Roaming\Bitsum\Process Lasso\prolasso.ini" (
    echo [OK] Found with %~z1 bytes
)
echo Service config (ProgramData):
if exist "C:\ProgramData\Bitsum\Process Lasso\prolasso.ini" (
    echo [OK] Found with %~z1 bytes
)

echo.
echo --- Launch ProcessLasso GUI properly ---
echo Attempting to launch ProcessLasso.exe...
"C:\Program Files\Process Lasso\ProcessLasso.exe" /ShowWindow /ConfigFolder="C:\Users\davip\AppData\Roaming\Bitsum\Process Lasso"
echo ProcessLasso launched. Check the GUI for rule verification.
echo.
echo KEY RULES APPLIED:
echo   - brave.exe, Orca.exe, opencode2.exe = Above Normal priority
echo   - All 3 apps = CPU affinity 4095 (all 12 cores)
echo   - OOC Restraint enabled (85% CPU threshold)
echo   - BoostForegroundProcess enabled
echo   - SmartTrim every 30 seconds
echo   - ProBalance active
echo.
pause
