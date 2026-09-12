@echo off
echo Copying prolasso.ini to service config folder...
copy "C:\Users\davip\AppData\Roaming\Bitsum\Process Lasso\prolasso.ini" "C:\ProgramData\Bitsum\Process Lasso\prolasso.ini" /Y /Q
if %errorlevel% equ 0 (
    echo [OK] Service config updated.
) else (
    echo [FAIL] Could not copy.
)
echo.
echo Verifying service config has rules...
find "DefaultPriorities" "C:\ProgramData\Bitsum\Process Lasso\prolasso.ini" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Service config has DefaultPriorities rules
) else (
    echo [FAIL] Service config missing rules
)
echo.
pause
