@echo off
REM ============================================================
REM Strength Intelligence — Start Script (Windows)
REM Double-click this file to start the application
REM ============================================================

echo.
echo   ◆  STRENGTH INTELLIGENCE  ◆
echo   Starting up...
echo.

REM Install Python backend
echo [1/3] Installing Python dependencies...
cd backend
pip install -r requirements.txt --quiet
cd ..

REM Install React frontend
echo [2/3] Installing React dependencies...
cd frontend
npm install --silent
cd ..

REM Start backend in new window
echo [3/3] Starting servers...
start "SI Backend" cmd /c "cd backend && python app.py"

REM Start frontend
echo.
echo   Backend API  → http://localhost:5000
echo   Frontend App → http://localhost:3000
echo.
echo   Close this window to stop the app.
echo.
cd frontend
set REACT_APP_API_URL=http://localhost:5000/api
npm start
