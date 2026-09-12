@echo off
echo Searching for Process Lasso executables...
echo.

REM Search common locations
if exist "C:\Program Files\Bitsum\Process Lasso\ProcessGovernor.exe" (
    echo [FOUND] C:\Program Files\Bitsum\Process Lasso\ProcessGovernor.exe
)
if exist "C:\Program Files (x86)\Bitsum\Process Lasso\ProcessGovernor.exe" (
    echo [FOUND] C:\Program Files (x86)\Bitsum\Process Lasso\ProcessGovernor.exe
)
if exist "C:\Program Files\Process Lasso\ProcessGovernor.exe" (
    echo [FOUND] C:\Program Files\Process Lasso\ProcessGovernor.exe
)
if exist "C:\Program Files (x86)\Process Lasso\ProcessGovernor.exe" (
    echo [FOUND] C:\Program Files (x86)\Process Lasso\ProcessGovernor.exe
)

echo.
echo Searching via PATH...
where ProcessGovernor.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo ProcessGovernor.exe found in PATH
    where ProcessGovernor.exe
)

where ProcessLasso.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo ProcessLasso.exe found in PATH
    where ProcessLasso.exe
)

echo.
echo Searching via registry...
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" /s 2>nul | findstr /i "Process Lasso" >nul 2>&1
if %errorlevel% equ 0 (
    echo Process Lasso found in registry uninstall
)

echo.
echo Listing Program Files\Bitsum directories...
dir "C:\Program Files\Bitsum" /b /s 2>nul
dir "C:\Program Files (x86)\Bitsum" /b /s 2>nul

echo.
echo Listing all Bitsum .exe files...
dir /s /b "C:\Program Files\Bitsum\*.exe" 2>nul
dir /s /b "C:\Program Files (x86)\Bitsum\*.exe" 2>nul

echo.
echo Check complete.
pause
