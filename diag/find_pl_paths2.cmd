@echo off
echo Finding Process Lasso executables...
echo.

REM Check service path for Process Governor
sc qc ProcessGovernor >nul 2>&1
echo --- Service path ---
sc qc ProcessGovernor 2>&1 | findstr "BINARY_PATH_NAME"

echo.
REM Check where command
echo --- where ProcessGovernor ---
where ProcessGovernor.exe 2>&1

echo.
echo --- where ProcessLasso ---
where ProcessLasso.exe 2>&1

echo.
echo --- Checking install locations ---
if exist "C:\Program Files\Bitsum\Process Lasso\ProcessGovernor.exe" echo [FOUND] "C:\Program Files\Bitsum\Process Lasso\ProcessGovernor.exe"
if exist "C:\Program Files\Bitsum\Process Lasso\ProcessLasso.exe" echo [FOUND] "C:\Program Files\Bitsum\Process Lasso\ProcessLasso.exe"
if exist "C:\Program Files (x86)\Bitsum\Process Lasso\ProcessGovernor.exe" echo [FOUND] "(x86)\Bitsum\Process Lasso\ProcessGovernor.exe"
if exist "C:\Program Files\Process Lasso\ProcessGovernor.exe" echo [FOUND] "C:\Program Files\Process Lasso\ProcessGovernor.exe"

echo.
echo --- Checking Process Lasso directory ---
dir /b /s "C:\Program Files\Bitsum\*.exe" 2>nul
dir /b /s "C:\Program Files\Process Lasso\*.exe" 2>nul
dir /b /s "C:\Program Files (x86)\Process Lasso\*.exe" 2>nul
dir /b /s "C:\Program Files (x86)\Bitsum\*.exe" 2>nul

echo.
echo Done.
pause
