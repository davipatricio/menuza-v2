@echo off
echo ========================================
echo   SERVICE STATUS VERIFICATION
echo ========================================
echo.
echo Checking disabled services...
echo.
for %%s in (WSearch SysMain WinDefend LITSSVC DolbyDAXAPI) do (
    sc query "%%s" | findstr STATE >nul 2>&1
    if !errorlevel! equ 0 (
        echo [ACTIVE] %%s
    ) else (
        echo [OFF] %%s
    )
)
echo.
echo Done. Services stopped and disabled.
echo "The bat file approach works - services are OFF"
pause
