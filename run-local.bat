@echo off
cd /d "%~dp0backend"
python -m pip install -r requirements.txt -q
cd /d "%~dp0"
start "Leads API" cmd /k "%~dp0start-backend.bat"
start "Leads UI" cmd /k "cd /d %~dp0frontend && npm install && npm run dev"
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo If port 8000 is busy, run: start-backend.bat 8080
echo Then set VITE_API_URL=http://localhost:8080 in .env and restart the frontend.
