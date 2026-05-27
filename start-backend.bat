@echo off
setlocal
cd /d "%~dp0backend"
set PYTHONPATH=%~dp0backend

set PORT=%1
if "%PORT%"=="" set PORT=8000

:check_port
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if %ERRORLEVEL%==0 (
  if "%PORT%"=="8000" (
    echo Port 8000 is in use. Trying 8080 instead...
    set PORT=8080
    goto check_port
  )
  echo Port %PORT% is already in use. Close the other server and try again.
  exit /b 1
)

echo Starting API on http://127.0.0.1:%PORT%
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port %PORT%
