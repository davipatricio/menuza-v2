@echo off
echo ========================================
echo   FIND Process Lasso Config Location
echo ========================================
echo.
echo Checking common locations...
echo.

if exist "%APPDATA%\Bitsum\Process Lasso\prolasso.ini" (
    echo [FOUND] %APPDATA%\Bitsum\Process Lasso\prolasso.ini
    echo   Contents:
    type "%APPDATA%\Bitsum\Process Lasso\prolasso.ini" | find /n "." >nul 2>&1
) else (
    echo [NOT FOUND] %APPDATA%\Bitsum\Process Lasso\prolasso.ini
)

echo.
if exist "%LOCALAPPDATA%\Bitsum\Process Lasso\prolasso.ini" (
    echo [FOUND] %LOCALAPPDATA%\Bitsum\Process Lasso\prolasso.ini
) else (
    echo [NOT FOUND] %LOCALAPPDATA%\Bitsum\Process Lasso\prolasso.ini
)

echo.
echo Checking ProgramData...
if exist "C:\ProgramData\Bitsum\Process Lasso\prolasso.ini" (
    echo [FOUND] C:\ProgramData\Bitsum\Process Lasso\prolasso.ini
) else (
    echo [NOT FOUND] C:\ProgramData\Bitsum\Process Lasso\prolasso.ini
)

echo.
echo Checking Program Files...
dir "C:\Program Files\Bitsum" /b 2>nul

echo.
echo ========================================
echo   Default Install Location for Process Lasso
echo ========================================
echo.
echo If not found in AppData, check:
echo   C:\Program Files\Process Lasso\prolasso.ini
echo   C:\Program Files (x86)\Bitsum\Process Lasso\
echo.
echo The config folder can be specified with:
echo   ProcessLasso.exe /ConfigFolder=path
echo.
echo ProcessGovernor service uses the global config folder.
echo.
pause
