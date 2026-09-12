@echo off
echo ========================================
echo   INSTALL Process Lasso Config
echo   Based on bitsum.com official docs
echo ========================================
echo.
echo This copies the corrected prolasso.ini to the
echo correct location and sets up all Windows tweaks.
echo.

REM ========================================
REM 1. INSTALL PROlasso.INI
REM ========================================
echo Step 1: Installing Process Lasso configuration...
echo.

REM Find the correct config folder
set "PL_FOLDER=%APPDATA%\Bitsum\Process Lasso"
if not exist "%PL_FOLDER%" mkdir "%PL_FOLDER%"

REM Copy the config file
copy /y "C:\Users\davip\Documents\Projetos\menuza\diag\prolasso.ini" "%PL_FOLDER%\prolasso.ini" >nul
if %errorlevel% equ 0 (
    echo [OK] prolasso.ini installed to %PL_FOLDER%
) else (
    echo [FAIL] Could not copy prolasso.ini
)

REM Also set up the service config folder
set "SVC_FOLDER=C:\ProgramData\Bitsum\Process Lasso"
if not exist "%SVC_FOLDER%" mkdir "%SVC_FOLDER%"
copy /y "C:\Users\davip\Documents\Projetos\menuza\diag\prolasso.ini" "%SVC_FOLDER%\prolasso.ini" >nul
if %errorlevel% equ 0 (
    echo [OK] prolasso.ini installed to %SVC_FOLDER% (service config)
)

echo.
echo ========================================
REM 2. POWERCFG TWEAKS (run as admin)
REM ========================================
echo Step 2: Powercfg tweaks...
echo.

REM Duplicate the Bitsum scheme to ensure it exists
powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Duplicated Bitsum performance scheme
) else (
    echo [WARN] Could not duplicate scheme (may already exist)
)

REM Disable idle to allow CPU to boost to full clock
powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR IDLEDISABLE 1 >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] CPU idle disabled (allows full boost)
) else (
    echo [WARN] Could not set IDLEDISABLE (may already be set)
)

echo.
echo ========================================
REM 3. REGISTRY TWEAKS (run as admin)
REM ========================================
echo Step 3: Registry tweaks...
echo.

REM Hardware GPU Scheduling
reg add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" /v HWSchMode /t REG_DWORD /d 2 /f >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] HWSchMode = 2 (Hardware GPU Scheduling)
) else (
    echo [WARN] Could not set HWSchMode (already set?)
)

REM Win32PrioritySeparation = 26 (decimal) for better thread responsiveness
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\SubSystems" /v Win32PrioritySeparation /t REG_SZ /d "26" /f >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Win32PrioritySeparation = 26
) else (
    echo [WARN] Could not set Win32PrioritySeparation
)

echo.
echo ========================================
REM 4. SYSTEM BOOT TWEAK (run as admin)
REM ========================================
echo Step 4: System boot tweaks...
echo.

REM Disable dynamic tick for lower input latency
bcdedit /set disabledynamictick yes >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Dynamic tick disabled (lower input latency)
) else (
    echo [WARN] Could not set disabledynamictick (already set?)
)

REM Disable prefetcher and superfetch on NVMe (minimal benefit)
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters" /v EnablePrefetcher /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters" /v EnableSuperfetch /t REG_DWORD /d 0 /f >nul 2>&1
echo [OK] Prefetcher and Superfetch disabled

echo.
echo ========================================
REM 5. DISABLING SERVICES (run as admin)
REM ========================================
echo Step 5: Disabling unnecessary services...
echo.

REM Set startup type to DISABLED (4=DISABLED, 2=AUTO_START)
reg add "HKLM\SYSTEM\CurrentControlSet\Services\WSearch" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\SysMain" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\WinDefend" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\LITSSVC" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\DolbyDAXAPI" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\ElevocService" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\LenovoFnAndFunctionKeys" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\webthreatdefusersvc_31d439" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\TrustInstaller" /v Start /t REG_DWORD /d 4 /f

echo [OK] All 9 services set to DISABLED in registry.
echo.

echo ========================================
echo  ALL DONE!
echo ========================================
echo.
echo NEXT STEPS:
echo   1. Reboot your computer (end of day)
echo   2. Run 'wsl --shutdown' before reboot
echo   3. After reboot, check Process Lasso settings in GUI
echo   4. Verify services are stopped in Services.msc
echo   5. Check .wslconfig: change memory=8GB to memory=4GB
echo      and processors=10 to processors=4
echo.
echo The prolasso.ini has been installed. Restart Process Lasso.
echo.
pause
