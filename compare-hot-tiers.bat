@echo off
cd /d "%~dp0"
set PYTHONPATH=%~dp0backend
python backend\app\scripts\compare_hot_tiers.py
pause
