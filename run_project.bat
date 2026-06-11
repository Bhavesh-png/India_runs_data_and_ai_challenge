@echo off
echo ==========================================
echo Starting SmartHire AI Candidate System...
echo ==========================================

:: 1. Run Python pipeline to ensure data is generated
echo [1/3] Running Python Candidate Scorer...
call .venv\Scripts\activate.bat
python rank.py
if %errorlevel% neq 0 (
    echo Python scorer failed!
    pause
    exit /b %errorlevel%
)

:: 2. Start Backend in a new window
echo [2/3] Starting Backend Express Server in new window...
start cmd /k "cd backend && npm start"

:: 3. Start Frontend in a new window
echo [3/3] Starting Frontend React Dashboard in new window...
start cmd /k "cd frontend && npm run dev"

echo ==========================================
echo All services launched successfully!
echo ==========================================
pause
