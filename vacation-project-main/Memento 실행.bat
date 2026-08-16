@echo off
if /i not "%~1"=="__run__" (
    cmd /k "%~f0" __run__
    exit /b
)

title Memento - Local Server
chcp 65001 >nul 2>&1

REM 프로젝트 폴더
set "PROJECT_DIR=%~dp0public"

if not exist "%PROJECT_DIR%\index.html" goto missing

cd /d "%PROJECT_DIR%"
if errorlevel 1 goto cd_fail

echo.
echo  ========================================
echo   Memento 웹 페이지를 시작합니다
echo  ========================================
echo.
echo  프로젝트: %PROJECT_DIR%
echo  주소:     http://localhost:8080/
echo.
echo  브라우저가 자동으로 열립니다.
echo  종료하려면 이 창을 닫거나 Ctrl+C 를 누르세요.
echo.

set "PORT=8080"

py --version >nul 2>&1
if not errorlevel 1 goto use_py

python --version >nul 2>&1
if not errorlevel 1 goto use_python

goto use_powershell

:use_py
start "" cmd /c "ping -n 2 127.0.0.1>nul && start http://localhost:%PORT%/"
py -m http.server %PORT%
goto end

:use_python
start "" cmd /c "ping -n 2 127.0.0.1>nul && start http://localhost:%PORT%/"
python -m http.server %PORT%
goto end

:use_powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port %PORT% -Root "%PROJECT_DIR%"
goto end

:missing
echo.
echo [오류] index.html 을 찾을 수 없습니다.
echo.
echo  예상 경로:
echo  %PROJECT_DIR%\index.html
echo.
goto end

:cd_fail
echo.
echo [오류] 프로젝트 폴더로 이동할 수 없습니다.
echo  %PROJECT_DIR%
echo.
goto end

:end
echo.
echo 서버가 종료되었습니다.
echo.
