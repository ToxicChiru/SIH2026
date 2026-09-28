@echo off
setlocal enabledelayedexpansion
title Mausam - Weather ^& Convective Hazard Intelligence

echo =====================================================================
echo    Mausam - Hyperlocal Weather ^& Convective Hazard Intelligence
echo    Smart India Hackathon 2026 (SIH2026)
echo =====================================================================
echo.

:: 1. Locate application directory
set "APP_DIR="
if exist "%~dp0mausam-deploy\app.py" (
    set "APP_DIR=%~dp0mausam-deploy"
) else if exist "%~dp0SIH2026\mausam-deploy\app.py" (
    set "APP_DIR=%~dp0SIH2026\mausam-deploy"
) else if exist "%~dp0app.py" (
    set "APP_DIR=%~dp0"
)

if "%APP_DIR%"=="" (
    echo [ERROR] Could not locate 'app.py' in project folders.
    echo Please make sure this batch file is in the project directory.
    echo.
    pause
    exit /b 1
)

cd /d "%APP_DIR%"
echo [*] Working Directory: %APP_DIR%

:: 2. Check for Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    where py >nul 2>nul
    if %errorlevel% neq 0 (
        echo [ERROR] Python is not found in system PATH.
        echo Please install Python 3.10+ from https://www.python.org/
        echo Make sure to check 'Add Python to PATH' during installation.
        echo.
        pause
        exit /b 1
    ) else (
        set "PY_CMD=py"
    )
) else (
    set "PY_CMD=python"
)

echo [*] Python detected:
%PY_CMD% --version
echo.

:: 3. Check / Install dependencies
echo [*] Checking required dependencies...
%PY_CMD% -c "import flask, requests" >nul 2>nul
if %errorlevel% neq 0 (
    echo [*] Installing dependencies from requirements.txt...
    %PY_CMD% -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies. Check your internet connection or Python setup.
        echo.
        pause
        exit /b 1
    )
) else (
    echo [OK] Core dependencies [Flask, requests] already installed.
)
echo.

:: 4. Launch browser in background after short delay
echo [*] Starting web portal launcher: http://localhost:8000
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000"

:: 5. Start Flask application
echo =====================================================================
echo    Server running on: http://localhost:8000
echo    Press Ctrl+C in this console window to stop the application.
echo =====================================================================
echo.

%PY_CMD% app.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Application terminated with an error code: %errorlevel%
    pause
)
