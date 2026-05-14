# Strength Intelligence System
## Python Backend + React Frontend

---

## Start in 3 steps

### Step 1 — Open the .env file
Edit the `.env` file in this folder. The only value you need to change is `ANTHROPIC_API_KEY`.

Get a free API key at: https://console.anthropic.com
Replace `sk-ant-REPLACE_WITH_YOUR_KEY_FROM_CONSOLE_ANTHROPIC_COM` with your actual key.

The app works WITHOUT the API key — you just won't get AI-powered narratives. Everything else works fine.

### Step 2 — Install requirements

You need:
- Python 3.8+  (check: `python3 --version`)
- Node.js 16+  (check: `node --version`)

### Step 3 — Run

**Mac / Linux:**
```
chmod +x start.sh
./start.sh
```

**Windows:**
Double-click `start.bat`

**Or run manually:**
```
# Terminal 1 — Backend
cd backend
pip3 install -r requirements.txt
python3 app.py

# Terminal 2 — Frontend
cd frontend
npm install
npm start
```

Then open: http://localhost:3000

---

## What you get

### 5 pages, all working:

| Page | What it does |
|------|-------------|
| Dashboard | Overview of all profiles, strength distribution, risk flags |
| Strength Assessment | 5-step wizard: profile → archetypes → questions → energy map → results |
| Intelligence Profiles | Gallery of all assessed individuals with scores |
| Gap Analysis | Compare any profile against any target role |
| Performance Engine | Strength-aligned goal tracking |

### Clear inputs and outputs on every page

Every module shows exactly what you put in and what you get out — no black boxes.

### AI-powered narratives

When `ANTHROPIC_API_KEY` is set, the assessment page generates a personalised Claude-powered interpretation of each strength profile.

---

## Project structure

```
strength-intelligence/
  .env                    ← Edit this — add your Anthropic key
  start.sh                ← Mac/Linux: run this to start everything
  start.bat               ← Windows: double-click this

  backend/
    app.py                ← Flask API (all endpoints)
    requirements.txt      ← Python dependencies

  frontend/
    package.json          ← React dependencies
    src/
      App.jsx             ← Main app shell + sidebar navigation
      App.css             ← Complete dark theme styles
      pages/
        Dashboard.jsx     ← Organisation overview
        Assessment.jsx    ← 5-step assessment wizard
        Profiles.jsx      ← Profile gallery + Gap + Performance
      utils/
        api.js            ← All API calls to the backend
```

---

## API endpoints (backend on port 5000)

```
GET  /health                           Server health check
GET  /api/archetypes                   All 12 strength archetypes
GET  /api/questions                    Assessment questions
GET  /api/energy-activities            Energy mapping activities
GET  /api/roles                        Available target roles

POST /api/profiles                     Create a profile
GET  /api/profiles                     List all profiles
GET  /api/profiles/:id                 Get one profile

POST /api/assessments                  Start an assessment
PUT  /api/assessments/:id/complete     Submit answers + compute scores
GET  /api/assessments/:id              Get a completed assessment

POST /api/gap-analysis                 Run gap analysis
GET  /api/dashboard                    Organisation overview data

GET  /api/profiles/:id/goals           Get goals for a profile
POST /api/profiles/:id/goals           Add a goal
PATCH /api/goals/:id/toggle            Toggle goal done/not done

POST /api/ai/interpret                 AI narrative (needs API key)
```

---

## The 12 Strength Archetypes

| Stone | Archetype |
|-------|-----------|
| Emerald | Growth & Development |
| Diamond | Clarity & Truth |
| Onyx | Systems & Execution |
| Sapphire | Vision & Strategy |
| Ruby | Activation & Momentum |
| Amber | Stability & Support |
| Quartz | Administration & Order |
| Opal | Innovation & Creativity |
| Pearl | Culture & Values |
| Topaz | Teaching & Knowledge |
| Rose Quartz | Relationship & Cohesion |
| Jade | Completion & Quality |

---

*Strength Intelligence — Discover. Profile. Analyse. Develop. Perform.*
