@echo off
echo ========================================
echo   FORCE STOP & DISABLE SERVICES
echo ========================================
echo.

REM ========================================
REM SET STARTUP TYPE TO DISABLED (4=DISABLED)
REM via registry: HKLM\SYSTEM\CurrentControlSet\Services\{ServiceName}
REM ========================================

echo Setting startup type to DISABLED...

reg add "HKLM\SYSTEM\CurrentControlSet\Services\WSearch" /v Start /t REG_DWORD /d 4 /f >nul 2>&1
echo [REG] WSearch -> Disabled

reg add "HKLM\SYSTEM\CurrentControlSet\Services\SysMain" /v Start /t REG_DWORD /d 4 /f >nul 2>&1
echo [REG] SysMain -> Disabled

reg add "HKLM\SYSTEM\CurrentControlSet\Services\WinDefend" /v Start /t REG_DWORD /d 4 /f >nul 2>&1
echo [REG] WinDefend -> Disabled

reg add "HKLM\SYSTEM\CurrentControlSet\Services\LITSSVC" /v Start /t REG_DWORD /d 4 /f >nul 2>&1
echo [REG] LITSSVC -> Disabled

reg add "HKLM\SYSTEM\CurrentControlSet\Services\DolbyDAXAPI" /v Start /t REG_DWORD /d 4 /f >nul 2>&1
echo [REG] DolbyDAXAPI -> Disabled

reg add "HKLM\SYSTEM\CurrentControlSet\Services\ElevocService" /v Start /t REG_DWORD /d 4 /f >nul 2>&1
echo [REG] ElevocService -> Disabled

reg add "HKLM\SYSTEM\CurrentControlSet\Services\AMCCrashDefender" /v Start /t REG_DWORD /d 4 /f >nul 2>&1
echo [REG] AMCCrashDefender -> Disabled

reg add "HKLM\SYSTEM\CurrentControlSet\Services\webthreatdefusersvc_31d439" /v Start /t REG_DWORD /d 4 /f >nul 2>&1
echo [REG] webthreatdefusersvc_31d439 -> Disabled

reg add "HKLM\SYSTEM\CurrentControlSet\Services\LenovoFnAndFunctionKeys" /v Start /t REG_DWORD /d 4 /f >nul 2>&1
echo [REG] LenovoFnAndFunctionKeys -> Disabled

REM Stop the TrustInstaller (protects some services)
reg add "HKLM\SYSTEM\CurrentControlSet\Services\TrustInstaller" /v Start /t REG_DWORD /d 4 /f >nul 2>&1
echo [REG] TrustInstaller -> Disabled

echo.
echo ========================================
echo   FORCE KILL PROCESS NAMES
echo ========================================
echo.

REM Kill associated processes
taskkill /f /im SearchIndexer.exe >nul 2>&1
taskkill /f /im SearchUI.exe >nul 2>&1
taskkill /f /im SearchApp.exe >nul 2>&1
taskkill /f /im MsMpEng.exe >nul 2>&1
taskkill /f /im SecurityHealthSystray.exe >nul 2>&1
taskkill /f /im amdcrashdefender.exe >nul 2>&1

echo Process cleanup done.
echo.
echo ========================================
echo   CURRENT STATUS
echo ========================================
echo.
echo Services are now DISABLED in registry (Start=4).
echo Processes terminated where possible.
echo.
echo After REBOOT:
echo   - All 9 services will be stopped and NOT restart
echo   - WSearch indexer will stop
echo   - SysMain/SuperFetch will stop
echo   - Defender will be fully offline
echo   - LITSSVC (Lenovo update) will stop
echo   - Dolby audio service will stop
echo   - Lenovo function key service will stop
echo   - ElevocService and webthreatdef usersvc will stop
echo.
echo NOTE: Some services may take a moment to fully stop after reboot.
echo Run 'wsl --shutdown' and reboot at end of day.
echo.
pause
