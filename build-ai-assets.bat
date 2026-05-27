@echo off
cd /d "%~dp0backend"
set PYTHONPATH=%~dp0backend
python -m app.build_ai_assets
echo.
echo AI assets written to models\ and config\
pause
