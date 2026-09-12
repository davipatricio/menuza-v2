@echo off
REM === Run as Administrator: svc_disable2.cmd ===
REM Sets 9 services to Disabled (Start=4) via registry

echo Disabling services via registry...
echo.

REM 4 = DISABLED, 2 = AUTO_START
reg add "HKLM\SYSTEM\CurrentControlSet\Services\WSearch" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\SysMain" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\WinDefend" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\LITSSVC" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\DolbyDAXAPI" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\ElevocService" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\LenovoFnAndFunctionKeys" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\webthreatdefusersvc_31d439" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\TrustInstaller" /v Start /t REG_DWORD /d 4 /f

echo.
echo Registry changes done. Checking...
echo.

for %%s in (WSearch SysMain WinDefend LITSSVC DolbyDAXAPI ElevocService LenovoFnAndFunctionKeys webthreatdefusersvc_31d439 TrustInstaller) do (
    reg query "HKLM\SYSTEM\CurrentControlSet\Services\%%s" /v Start 2>nul | findstr "0x4" >nul 2>&1
    if !errorlevel! equ 0 (
        echo [OK] %%s is DISABLED
    ) else (
        reg query "HKLM\SYSTEM\CurrentControlSet\Services\%%s" /v Start 2>nul | findstr "0x2" >nul 2>&1
        if !errorlevel! equ 0 (
            echo [FAIL] %%s is still AUTO_START
        )
    )
)

echo.
echo Reboot at end of day for full effect.
echo.
pause
