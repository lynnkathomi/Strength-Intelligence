#!/bin/bash
# ============================================================
# Strength Intelligence — Start Script (Mac / Linux)
# Run this once: chmod +x start.sh && ./start.sh
# ============================================================

set -e

echo ""
echo "  ◆  STRENGTH INTELLIGENCE  ◆"
echo "  Starting up..."
echo ""

# ── 1. Install Python backend deps ──────────────────────────
echo "[1/3] Installing Python dependencies..."
cd backend
pip3 install -r requirements.txt --quiet
cd ..

# ── 2. Install React frontend deps ──────────────────────────
echo "[2/3] Installing React dependencies..."
cd frontend
npm install --silent
cd ..

# ── 3. Start both servers ────────────────────────────────────
echo "[3/3] Starting servers..."
echo ""
echo "  Backend API  →  http://localhost:5000"
echo "  Frontend App →  http://localhost:3000"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

# Start backend in background
cd backend
python3 app.py &
BACKEND_PID=$!
cd ..

# Start frontend
cd frontend
REACT_APP_API_URL=http://localhost:5000/api npm start

# Kill backend when frontend exits
kill $BACKEND_PID 2>/dev/null
