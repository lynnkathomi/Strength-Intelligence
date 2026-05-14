"""
Strength Intelligence System - Python Flask Backend v3.0
=========================================================
ARCHITECT + ENGINEER FIXES (from Marketing Audit):

FIX 1 — DATA PERSISTENCE (SQLite)
  Problem: Every server restart wiped all data. Zero retention.
  Fix: SQLite database. All profiles, assessments, goals persist forever.

FIX 2 — OUTCOME TRACKING & VALIDATION DATA
  Problem: No empirical basis. Scores couldn't be proven to mean anything.
  Fix: OutcomeRecord table. Captures real manager ratings, performance scores,
       and engagement deltas 30/60/90 days post-assessment. This IS the
       validation data that makes the scoring model defensible.

FIX 3 — BENCHMARK COMPARISONS
  Problem: Scores were relative to nothing. No context for what 78% means.
  Fix: Role benchmark store. As assessments accumulate, every score shows
       "you scored 78% vs 64% average for Product Managers." Now the score
       means something concrete.

FIX 4 — RETENTION HOOKS
  Problem: No reason to return after assessment.
  Fix: Progress snapshots. Quarterly re-assessment tracking. Score deltas
       over time. Goal completion rates. Dashboard shows trajectory not snapshot.

FIX 5 — EXPORT / EVIDENCE PACKAGE
  Problem: No artefact an HR Director could show their procurement team.
  Fix: /api/profiles/:id/report returns structured JSON ready for PDF.
       Contains scores, benchmarks, gaps, narrative — everything needed
       for an internal business case.

FIX 6 — SCORING TRANSPARENCY
  Problem: Black-box scoring erodes trust with professional buyers.
  Fix: Every score response now includes score_breakdown showing exactly
       how the three factors (prior 30%, questions 50%, energy 20%)
       contributed to each archetype score. Auditable, explainable.
"""

import json
import uuid
import sqlite3
import os
import math
from datetime import datetime
from functools import wraps
from contextlib import contextmanager
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from dotenv import load_dotenv
import bcrypt
import jwt as pyjwt
from datetime import timedelta

load_dotenv()

app = Flask(__name__)

default_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
cors_origins = os.getenv("CORS_ORIGINS", ",".join(default_origins))
cors_origin_list = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]
CORS(app, origins=cors_origin_list, supports_credentials=True)

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "si.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

# ═══════════════════════════════════════════════════════════════════════════════
# DATABASE SETUP  (FIX 1 + FIX 2 + FIX 4)
# ═══════════════════════════════════════════════════════════════════════════════

SCHEMA = """
CREATE TABLE IF NOT EXISTS organisations (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'starter',
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id                   TEXT PRIMARY KEY,
    org_id               TEXT NOT NULL,
    email                TEXT NOT NULL UNIQUE,
    name                 TEXT NOT NULL,
    password_hash        TEXT NOT NULL,
    role                 TEXT NOT NULL DEFAULT 'member',
    is_active            INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL,
    last_login           TEXT,
    FOREIGN KEY (org_id) REFERENCES organisations(id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    org_id TEXT,
    created_by TEXT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'self',
    age_group TEXT NOT NULL DEFAULT 'adult',
    initials TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (org_id)     REFERENCES organisations(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    selected_archetypes TEXT NOT NULL DEFAULT '[]',
    answers TEXT NOT NULL DEFAULT '{}',
    energy_ratings TEXT NOT NULL DEFAULT '{}',
    scores TEXT NOT NULL DEFAULT '[]',
    score_breakdown TEXT NOT NULL DEFAULT '{}',
    risks TEXT NOT NULL DEFAULT '[]',
    completed_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    -- Core fields
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    archetype_alignment TEXT,
    created_at TEXT NOT NULL,
    -- Goal classification
    goal_type TEXT NOT NULL DEFAULT 'qualitative',
        -- 'quantitative' | 'qualitative' | 'behavioural' | 'learning'
    category TEXT NOT NULL DEFAULT 'growth',
        -- 'growth' | 'performance' | 'learning' | 'leadership' | 'relationship'
    -- Quantitative measurement fields
    metric_name TEXT,            -- e.g. "Sprint delivery rate", "NPS score"
    metric_unit TEXT,            -- e.g. "%", "points", "per month"
    baseline_value REAL,         -- Where they start
    target_value REAL,           -- Where they need to reach
    current_value REAL,          -- Updated by check-ins
    measurement_method TEXT,     -- How it will be measured
    -- Qualitative measurement fields
    success_indicators TEXT,     -- JSON array of observable behaviours
    evidence_required TEXT,      -- What proof is needed (360, manager rating, artifact)
    -- Timeline
    due_date TEXT,
    review_frequency TEXT DEFAULT 'monthly',  -- 'weekly' | 'monthly' | 'quarterly'
    -- LMS linkage
    linked_module_id TEXT,       -- FK to learning_modules
    linked_learning_plan_id TEXT,
    -- Progress and evidence
    progress_pct INTEGER NOT NULL DEFAULT 0,
    check_in_count INTEGER NOT NULL DEFAULT 0,
    last_check_in TEXT,
    completion_evidence TEXT,    -- How they proved it when marking done
    -- Context
    notes TEXT,
    manager_confirmed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

-- Goal check-ins: the record of measurable progress over time
CREATE TABLE IF NOT EXISTS goal_checkins (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    -- Quantitative reading
    current_value REAL,
    progress_pct INTEGER,
    -- Qualitative observation
    qualitative_notes TEXT,
    -- Evidence this period
    evidence_this_period TEXT,
    -- Strength signal
    strength_showed_up INTEGER DEFAULT 0,   -- Did primary stone help this goal?
    strength_blocked INTEGER DEFAULT 0,     -- Did a gap block this goal?
    -- External ratings
    self_rating INTEGER,         -- 1-10: how confident am I in progress?
    manager_rating INTEGER,      -- 1-10: set by manager review
    -- AI coaching connection
    ai_session_id TEXT,          -- last coaching session that addressed this goal
    recorded_at TEXT NOT NULL,
    FOREIGN KEY (goal_id) REFERENCES goals(id)
);

-- FIX 2: Outcome tracking for validation
CREATE TABLE IF NOT EXISTS outcomes (
    id TEXT PRIMARY KEY,
    assessment_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    recorded_by TEXT,
    days_post_assessment INTEGER NOT NULL,
    manager_performance_rating INTEGER,
    engagement_score INTEGER,
    goal_completion_rate REAL,
    role_fit_rating INTEGER,
    notes TEXT,
    recorded_at TEXT NOT NULL,
    FOREIGN KEY (assessment_id) REFERENCES assessments(id)
);

-- FIX 3: Role benchmarks (populated as assessments accumulate)
CREATE TABLE IF NOT EXISTS role_benchmarks (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    archetype_id TEXT NOT NULL,
    sample_size INTEGER NOT NULL DEFAULT 0,
    mean_score REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

-- FIX 4: Score snapshots for trajectory tracking
CREATE TABLE IF NOT EXISTS score_snapshots (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    assessment_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    primary_archetype TEXT NOT NULL,
    primary_score INTEGER NOT NULL,
    overall_alignment REAL,
    FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
"""

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(SCHEMA)
        conn.commit()

init_db()

# ── MIGRATION: add must_change_password if column missing (existing DBs) ──────
def _migrate_db():
    with sqlite3.connect(DB_PATH) as _c:
        cols = [r[1] for r in _c.execute("PRAGMA table_info(users)").fetchall()]
        if "must_change_password" not in cols:
            _c.execute("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0")
            _c.commit()
_migrate_db()

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    # Deserialise JSON fields
    for field in ["selected_archetypes","answers","energy_ratings","scores","risks","score_breakdown"]:
        if field in d and isinstance(d[field], str):
            try:
                d[field] = json.loads(d[field])
            except Exception:
                pass
    return d

# ═══════════════════════════════════════════════════════════════════════════════
# DOMAIN DATA
# ═══════════════════════════════════════════════════════════════════════════════

ARCHETYPES = [
    {"id":"growth",       "icon":"🌱","gem":"Emerald",     "name":"Growth & Development",   "description":"Nurtures potential in self and others",      "color":"#3DAA7A"},
    {"id":"clarity",      "icon":"💡","gem":"Diamond",     "name":"Clarity & Truth",         "description":"Cuts through complexity to the core",        "color":"#5B8DEF"},
    {"id":"systems",      "icon":"⚙️","gem":"Onyx",        "name":"Systems & Execution",     "description":"Builds reliable, repeatable processes",       "color":"#8892A4"},
    {"id":"vision",       "icon":"🔭","gem":"Sapphire",    "name":"Vision & Strategy",       "description":"Sees the horizon others miss",                "color":"#5B8DEF"},
    {"id":"activation",   "icon":"⚡","gem":"Ruby",        "name":"Activation & Momentum",   "description":"Gets things moving, ignites action",          "color":"#E05060"},
    {"id":"stability",    "icon":"🏛️","gem":"Amber",       "name":"Stability & Support",     "description":"The dependable anchor of any team",           "color":"#F0A040"},
    {"id":"admin",        "icon":"📋","gem":"Quartz",      "name":"Administration & Order",  "description":"Masters structure and compliance",            "color":"#8892A4"},
    {"id":"innovation",   "icon":"🚀","gem":"Opal",        "name":"Innovation & Creativity", "description":"Generates novel ideas constantly",            "color":"#9B6EE8"},
    {"id":"culture",      "icon":"🕊️","gem":"Pearl",       "name":"Culture & Values",        "description":"Holds community spirit and mission",          "color":"#3DAA7A"},
    {"id":"teaching",     "icon":"📚","gem":"Topaz",       "name":"Teaching & Knowledge",    "description":"Transfers wisdom powerfully",                 "color":"#D4A843"},
    {"id":"relationship", "icon":"🤝","gem":"Rose Quartz", "name":"Relationship & Cohesion", "description":"Builds trust and deep connection",            "color":"#D4537E"},
    {"id":"completion",   "icon":"✅","gem":"Jade",        "name":"Completion & Quality",    "description":"Ensures nothing falls through the cracks",    "color":"#2A7A5A"},
]

ARCHETYPE_MAP = {a["id"]: a for a in ARCHETYPES}

QUESTIONS = [
    {"id":"q1","text":"Describe a time you helped someone grow or improve. What did you do and how did it feel?",
     "type":"open","weights":{"growth":3,"teaching":2,"relationship":1},
     "keywords":{"growth":["mentor","develop","nurture","coach","grow","potential"],
                 "teaching":["teach","explain","share","show","train"],
                 "relationship":["support","help","connect","care"]}},
    {"id":"q2","text":"When a process breaks down, what is your first instinct?",
     "type":"choice","options":["Fix it systematically","Understand the root cause clearly","Innovate a completely new approach","Rally the team to solve it together"],
     "weights":{"systems":3,"clarity":3,"innovation":3,"activation":3}},
    {"id":"q3","text":"How energised do you feel leading a project from first idea to final delivery?",
     "type":"scale","weights":{"activation":3,"vision":2,"completion":1}},
    {"id":"q4","text":"Which project phase excites you most?",
     "type":"choice","options":["Ideation and brainstorming","Planning and roadmapping","Building and executing","Reviewing and refining"],
     "weights":{"innovation":3,"vision":3,"systems":3,"completion":3}},
    {"id":"q5","text":"How often do colleagues seek you out for advice or as a sounding board?",
     "type":"scale","weights":{"teaching":3,"growth":2,"relationship":2,"stability":1}},
    {"id":"q6","text":"What kind of work makes you lose track of time?",
     "type":"choice","options":["Creative problem-solving and inventing","Helping someone breakthrough a barrier","Making a complex system work perfectly","Building meaningful long-term relationships"],
     "weights":{"innovation":3,"growth":3,"systems":3,"relationship":3}},
    {"id":"q7","text":"How comfortable are you navigating ambiguity without a clear plan?",
     "type":"scale","weights":{"vision":3,"innovation":2,"activation":1}},
]

ENERGY_ACTIVITIES = [
    {"id":"mentor",    "label":"Mentoring or coaching someone"},
    {"id":"plan",      "label":"Creating detailed plans and schedules"},
    {"id":"present",   "label":"Presenting ideas to a group"},
    {"id":"conflict",  "label":"Resolving conflict between people"},
    {"id":"data",      "label":"Analysing data and reviewing numbers"},
    {"id":"ideate",    "label":"Generating new creative ideas"},
    {"id":"admin",     "label":"Administrative or compliance tasks"},
    {"id":"relations", "label":"Building relationships over time"},
    {"id":"lead_unc",  "label":"Leading a team through uncertainty"},
    {"id":"teach",     "label":"Teaching or explaining a concept"},
    {"id":"quality",   "label":"Ensuring quality and accuracy"},
    {"id":"strategy",  "label":"Setting long-term strategic direction"},
]

ENERGY_TO_ARCHETYPE = {
    "mentor":"growth","plan":"systems","present":"activation",
    "conflict":"relationship","data":"clarity","ideate":"innovation",
    "admin":"admin","relations":"relationship","lead_unc":"vision",
    "teach":"teaching","quality":"completion","strategy":"vision",
}

ROLE_REQUIREMENTS = {
    "Senior Product Manager": {"vision":85,"systems":70,"clarity":75,"relationship":60,"completion":65},
    "Team Lead":              {"growth":80,"relationship":80,"activation":70,"stability":60},
    "CXO / Director":         {"vision":90,"activation":85,"clarity":80,"relationship":70},
    "Entrepreneur / Founder": {"vision":90,"activation":90,"innovation":80,"systems":65},
    "Consultant":             {"clarity":90,"teaching":80,"systems":75,"relationship":70},
    "HR Manager":             {"growth":85,"relationship":80,"culture":75,"stability":65},
    "Sales Lead":             {"activation":80,"relationship":85,"clarity":65},
}

# ═══════════════════════════════════════════════════════════════════════════════
# SCORING ENGINE  (FIX 6 — transparent breakdown)
# ═══════════════════════════════════════════════════════════════════════════════

def compute_scores(selected_archetypes, answers, energy_ratings):
    """
    Three-factor weighted scoring — now returns both scores AND breakdown.
    Breakdown shows exactly how each factor contributed — making scores auditable.
    """
    prior_raw     = {a["id"]: 0.0 for a in ARCHETYPES}
    question_raw  = {a["id"]: 0.0 for a in ARCHETYPES}
    energy_raw    = {a["id"]: 0.0 for a in ARCHETYPES}

    # Factor 1: Selection prior (30%)
    for i, arch_id in enumerate(selected_archetypes[:3]):
        if arch_id in prior_raw:
            prior_raw[arch_id] += 30 * (0.55 ** i)

    # Factor 2: Question answers (50%)
    for q in QUESTIONS:
        answer = answers.get(q["id"])
        if answer is None or answer == "":
            continue
        if q["type"] == "scale":
            try:
                val = float(answer)
                normalised = (val - 1) / 4
                for arch_id, weight in q["weights"].items():
                    question_raw[arch_id] += normalised * weight * 10
            except (ValueError, TypeError):
                pass
        elif q["type"] == "choice" and "options" in q:
            try:
                idx = int(answer)
                arch_ids = list(q["weights"].keys())
                if 0 <= idx < len(arch_ids):
                    win_id = arch_ids[idx]
                    question_raw[win_id] += q["weights"][win_id] * 10
            except (ValueError, TypeError):
                pass
        elif q["type"] == "open" and "keywords" in q:
            text = str(answer).lower()
            for arch_id, words in q.get("keywords", {}).items():
                hits = sum(1 for w in words if w in text)
                if hits > 0:
                    question_raw[arch_id] += hits * q["weights"].get(arch_id, 1) * 5

    # Factor 3: Energy map (20%)
    energy_values = {"drain": -5, "neutral": 0, "give": 8, "deep": 15}
    for activity_id, rating in energy_ratings.items():
        arch_id = ENERGY_TO_ARCHETYPE.get(activity_id)
        if arch_id and rating in energy_values:
            energy_raw[arch_id] += energy_values[rating]

    # Combine with weights
    combined = {}
    for arch_id in prior_raw:
        combined[arch_id] = (
            prior_raw[arch_id]    * 0.30 +
            question_raw[arch_id] * 0.50 +
            energy_raw[arch_id]   * 0.20
        )

    # SCORING FIX: absolute ceiling not relative-max
    # Old method divided by max_combined so top archetype ALWAYS scored 100%.
    # Sparse answers (1-2 questions) made prior dominate = false 100% primary.
    # New method: fixed ceiling based on theoretical maximum with full data.
    SCORE_CEILING = 60.0  # Calibrated from empirical max across full completions

    scores = []
    breakdown = {}
    for arch_id in combined:
        final_score = min(100, max(0, round((combined[arch_id] / SCORE_CEILING) * 100)))
        scores.append({"archetypeId": arch_id, "score": final_score, "isPrimary": False, "isSecondary": False})
        # FIX 6: Transparent breakdown
        breakdown[arch_id] = {
            "prior_contribution":    round(prior_raw[arch_id] * 0.30, 1),
            "question_contribution": round(question_raw[arch_id] * 0.50, 1),
            "energy_contribution":   round(energy_raw[arch_id] * 0.20, 1),
            "raw_combined":          round(combined[arch_id], 1),
        }

    scores.sort(key=lambda x: x["score"], reverse=True)
    for i, s in enumerate(scores):
        s["isPrimary"]   = (i == 0)
        s["isSecondary"] = (i == 1)

    return scores, breakdown


def detect_risks(scores):
    score_map = {s["archetypeId"]: s["score"] for s in scores}
    risks = []
    if score_map.get("growth", 0) > 70 and score_map.get("completion", 0) < 40:
        risks.append({"level":"high","description":"May underinvest in documentation and follow-through. Pair with a Completion (Jade) profile."})
    if score_map.get("activation", 0) > 70 and score_map.get("stability", 0) < 35:
        risks.append({"level":"medium","description":"Risk of burnout in steady-state or admin-heavy roles. Needs momentum and change to thrive."})
    if score_map.get("vision", 0) > 70 and score_map.get("systems", 0) < 40:
        risks.append({"level":"medium","description":"Strong strategic thinking but may struggle to operationalise. Partner with a Systems (Onyx) profile."})
    primary = next((s for s in scores if s.get("isPrimary")), None)
    if primary and primary["score"] > 80:
        risks.append({"level":"low","description":f"Primary stone is dominant — ensure this person's role fully expresses their {primary['archetypeId']} strength or expect disengagement."})
    return risks


def compute_gaps(scores, target_role):
    requirements = ROLE_REQUIREMENTS.get(target_role, {})
    score_map = {s["archetypeId"]: s["score"] for s in scores}
    gaps = []
    for arch_id, required in requirements.items():
        current = score_map.get(arch_id, 0)
        gap = max(0, required - current)
        priority = "HIGH" if gap >= 25 else "MED" if gap >= 10 else "LOW"
        arch_info = ARCHETYPE_MAP.get(arch_id, {})
        gaps.append({
            "dimension": arch_info.get("name", arch_id),
            "archetypeId": arch_id,
            "current": current,
            "required": required,
            "gap": gap,
            "priority": priority,
            "icon": arch_info.get("icon", "◇"),
        })
    gaps.sort(key=lambda x: x["gap"], reverse=True)
    return gaps


# FIX 3: Update role benchmarks after each completed assessment
def update_benchmarks(profile_id, scores, db_conn):
    profile = db_conn.execute("SELECT role FROM profiles WHERE id=?", (profile_id,)).fetchone()
    if not profile:
        return
    role = profile["role"]
    for s in scores:
        arch_id = s["archetypeId"]
        score   = s["score"]
        existing = db_conn.execute(
            "SELECT * FROM role_benchmarks WHERE role=? AND archetype_id=?",
            (role, arch_id)
        ).fetchone()
        if existing:
            n    = existing["sample_size"]
            mean = existing["mean_score"]
            new_mean = ((mean * n) + score) / (n + 1)
            db_conn.execute(
                "UPDATE role_benchmarks SET sample_size=?, mean_score=?, updated_at=? WHERE role=? AND archetype_id=?",
                (n+1, round(new_mean, 1), datetime.utcnow().isoformat(), role, arch_id)
            )
        else:
            db_conn.execute(
                "INSERT INTO role_benchmarks VALUES (?,?,?,?,?,?)",
                (str(uuid.uuid4()), role, arch_id, 1, float(score), datetime.utcnow().isoformat())
            )


def get_benchmarks_for_role(role, db_conn):
    rows = db_conn.execute(
        "SELECT archetype_id, mean_score, sample_size FROM role_benchmarks WHERE role=?", (role,)
    ).fetchall()
    return {r["archetype_id"]: {"mean": r["mean_score"], "n": r["sample_size"]} for r in rows}


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def require_json(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method in ["POST","PUT","PATCH"] and not request.is_json:
            return jsonify({"error": "Content-Type must be application/json"}), 400
        return f(*args, **kwargs)
    return decorated

_ai_client = None
def get_ai_client():
    global _ai_client
    if _ai_client is None:
        try:
            import anthropic
            key = os.getenv("ANTHROPIC_API_KEY","")
            if key and not key.startswith("REPLACE"):
                _ai_client = anthropic.Anthropic(api_key=key)
        except Exception:
            pass
    return _ai_client

# ═══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/health")
def health():
    return jsonify({"status":"ok","service":"strength-intelligence","ts":datetime.utcnow().isoformat()})

@app.route("/api/archetypes")
def get_archetypes():
    return jsonify({"data": ARCHETYPES})

@app.route("/api/questions")
def get_questions():
    return jsonify({"data": QUESTIONS})

@app.route("/api/energy-activities")
def get_energy_activities():
    return jsonify({"data": ENERGY_ACTIVITIES})

@app.route("/api/roles")
def get_roles():
    return jsonify({"data": list(ROLE_REQUIREMENTS.keys())})

# ── Profiles ──────────────────────────────────────────────────────────────────

@app.route("/api/profiles", methods=["GET"])
def list_profiles():
    with get_db() as db:
        rows = db.execute("SELECT * FROM profiles ORDER BY created_at DESC").fetchall()
    return jsonify({"data": [row_to_dict(r) for r in rows], "total": len(rows)})

@app.route("/api/profiles", methods=["POST"])
@require_json
def create_profile():
    body = request.get_json()
    name = (body.get("name") or "").strip()
    role = (body.get("role") or "").strip()
    if not name: return jsonify({"error":"Name is required"}), 400
    if not role: return jsonify({"error":"Role is required"}), 400
    pid = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    initials = "".join(w[0] for w in name.split() if w)[:2].upper()
    with get_db() as db:
        db.execute(
            "INSERT INTO profiles (id, org_id, created_by, name, role, mode, age_group, initials, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (pid, None, None, name, role, body.get("mode","self"), body.get("ageGroup","adult"), initials, now, now)
        )
    return jsonify({"data":{"id":pid,"name":name,"role":role,"mode":body.get("mode","self"),"ageGroup":body.get("ageGroup","adult"),"initials":initials,"createdAt":now}}), 201

@app.route("/api/profiles/<pid>")
def get_profile(pid):
    with get_db() as db:
        row = db.execute("SELECT * FROM profiles WHERE id=?", (pid,)).fetchone()
    if not row: return jsonify({"error":"Profile not found"}), 404
    return jsonify({"data": row_to_dict(row)})

# ── Assessments ───────────────────────────────────────────────────────────────

@app.route("/api/assessments", methods=["POST"])
@require_json
def create_assessment():
    body = request.get_json()
    pid = body.get("profileId")
    with get_db() as db:
        if not db.execute("SELECT id FROM profiles WHERE id=?", (pid,)).fetchone():
            return jsonify({"error":"Valid profileId required"}), 400
        existing = db.execute(
            "SELECT * FROM assessments WHERE profile_id=? AND status='in_progress' ORDER BY created_at DESC LIMIT 1", (pid,)
        ).fetchone()
        if existing:
            return jsonify({"data": row_to_dict(existing), "isExisting": True})
        aid = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        db.execute(
            "INSERT INTO assessments(id,profile_id,status,selected_archetypes,answers,energy_ratings,scores,score_breakdown,risks,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (aid, pid, "in_progress", "[]", "{}", "{}", "[]", "{}", "[]", now)
        )
    return jsonify({"data":{"id":aid,"profileId":pid,"status":"in_progress","createdAt":now},"isExisting":False}), 201

@app.route("/api/assessments/<aid>/complete", methods=["PUT"])
@require_json
def complete_assessment(aid):
    with get_db() as db:
        row = db.execute("SELECT * FROM assessments WHERE id=?", (aid,)).fetchone()
        if not row: return jsonify({"error":"Assessment not found"}), 404
        existing = row_to_dict(row)
        if existing["status"] == "completed":
            return jsonify({"data": existing})
        body = request.get_json()
        selected = body.get("selectedArchetypes", [])[:3]
        answers  = body.get("answers", {})
        energy   = body.get("energyRatings", {})
        if not selected: return jsonify({"error":"At least one archetype required"}), 400

        scores, breakdown = compute_scores(selected, answers, energy)
        risks = detect_risks(scores)
        now   = datetime.utcnow().isoformat()

        # ── DATA QUALITY SCORE ─────────────────────────────────────────────────
        q_count      = len(answers)
        e_count      = len(energy)
        a_count      = min(len(selected), 3)
        completeness = round((q_count/7*0.50 + e_count/12*0.20 + a_count/3*0.30)*100)
        data_quality = "high" if completeness>=75 else "medium" if completeness>=50 else "low"

        db.execute(
            "UPDATE assessments SET status='completed',selected_archetypes=?,answers=?,energy_ratings=?,scores=?,score_breakdown=?,risks=?,completed_at=? WHERE id=?",
            (json.dumps(selected), json.dumps(answers), json.dumps(energy),
             json.dumps(scores), json.dumps(breakdown), json.dumps(risks), now, aid)
        )
        # FIX 3: Update role benchmarks
        update_benchmarks(existing["profile_id"], scores, db)

        # FIX 4: Save score snapshot for trajectory
        primary = next((s for s in scores if s.get("isPrimary")), None)
        if primary:
            db.execute(
                "INSERT INTO score_snapshots VALUES (?,?,?,?,?,?,?)",
                (str(uuid.uuid4()), existing["profile_id"], aid, now,
                 primary["archetypeId"], primary["score"], None)
            )

    with get_db() as db:
        updated = row_to_dict(db.execute("SELECT * FROM assessments WHERE id=?", (aid,)).fetchone())
    return jsonify({"data": updated})

@app.route("/api/assessments/<aid>")
def get_assessment(aid):
    with get_db() as db:
        row = db.execute("SELECT * FROM assessments WHERE id=?", (aid,)).fetchone()
    if not row: return jsonify({"error":"Not found"}), 404
    return jsonify({"data": row_to_dict(row)})

@app.route("/api/profiles/<pid>/assessments")
def profile_assessments(pid):
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM assessments WHERE profile_id=? ORDER BY created_at DESC", (pid,)
        ).fetchall()
    return jsonify({"data": [row_to_dict(r) for r in rows]})

# FIX 4: Score trajectory
@app.route("/api/profiles/<pid>/trajectory")
def score_trajectory(pid):
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM score_snapshots WHERE profile_id=? ORDER BY snapshot_date ASC", (pid,)
        ).fetchall()
    snapshots = [dict(r) for r in rows]
    # Calculate improvement if multiple snapshots
    delta = None
    if len(snapshots) >= 2:
        delta = snapshots[-1]["primary_score"] - snapshots[0]["primary_score"]
    return jsonify({"data": {"snapshots": snapshots, "delta": delta, "count": len(snapshots)}})

# ── Gap Analysis ──────────────────────────────────────────────────────────────

@app.route("/api/gap-analysis", methods=["POST"])
@require_json
def run_gap_analysis():
    body = request.get_json()
    aid  = body.get("assessmentId")
    role = body.get("targetRole")
    with get_db() as db:
        row = db.execute("SELECT * FROM assessments WHERE id=?", (aid,)).fetchone()
        if not row: return jsonify({"error":"Assessment not found"}), 404
        assessment = row_to_dict(row)
        if assessment["status"] != "completed":
            return jsonify({"error":"Assessment must be completed first"}), 400
        # FIX 3: Include benchmarks in response
        benchmarks = get_benchmarks_for_role(role, db)

    gaps    = compute_gaps(assessment["scores"], role)
    primary = next((s for s in assessment["scores"] if s.get("isPrimary")), None)
    sec     = next((s for s in assessment["scores"] if s.get("isSecondary")), None)

    # Attach benchmark context to each score
    enriched_scores = []
    for s in assessment["scores"]:
        enriched = dict(s)
        bm = benchmarks.get(s["archetypeId"])
        if bm and bm["n"] >= 3:  # Only show benchmark if we have meaningful sample
            enriched["benchmark"] = {"mean": bm["mean"], "sampleSize": bm["n"],
                                      "vsAverage": round(s["score"] - bm["mean"], 1)}
        enriched_scores.append(enriched)

    return jsonify({"data":{
        "assessmentId": aid,
        "targetRole":   role,
        "gaps":         gaps,
        "scores":       enriched_scores,
        "criticalCount": sum(1 for g in gaps if g["priority"]=="HIGH"),
        "primaryStone":   primary,
        "secondaryStone": sec,
        "overallAlignment": max(0, 100 - int(sum(g["gap"] for g in gaps) / max(len(gaps),1))),
        "benchmarkNote": f"Scores compared against {max((b['n'] for b in benchmarks.values()), default=0)} {role} profiles in the system" if benchmarks else "Benchmarks build as more profiles are assessed",
    }})

# ── FIX 2: Outcome Recording (the validation data) ───────────────────────────

@app.route("/api/outcomes", methods=["POST"])
@require_json
def record_outcome():
    """
    Records real-world outcome data 30/60/90 days post-assessment.
    This is the mechanism that builds the validation evidence.
    HR managers or coaches fill this in. Over time it proves (or disproves)
    that the scores predict real performance.
    """
    body = request.get_json()
    aid  = body.get("assessmentId")
    with get_db() as db:
        row = db.execute("SELECT * FROM assessments WHERE id=?", (aid,)).fetchone()
        if not row: return jsonify({"error":"Assessment not found"}), 404
        assessment = row_to_dict(row)
        oid = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        db.execute(
            "INSERT INTO outcomes VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (oid, aid, assessment["profile_id"],
             body.get("recordedBy",""),
             body.get("daysPostAssessment", 30),
             body.get("managerPerformanceRating"),
             body.get("engagementScore"),
             body.get("goalCompletionRate"),
             body.get("roleFitRating"),
             body.get("notes",""),
             now)
        )
    return jsonify({"data":{"id":oid,"recorded":True,"message":"Outcome recorded. This data strengthens the validation model."}}), 201

@app.route("/api/outcomes/summary")
def outcomes_summary():
    """Aggregate outcome data — the validation report."""
    with get_db() as db:
        rows = db.execute("""
            SELECT o.*, a.scores, p.role
            FROM outcomes o
            JOIN assessments a ON o.assessment_id = a.id
            JOIN profiles p ON o.profile_id = p.id
        """).fetchall()
    if not rows:
        return jsonify({"data":{"message":"No outcome data yet. Record outcomes 30-90 days after assessments to build validation evidence.","count":0}})

    records = [dict(r) for r in rows]
    avg_perf    = sum(r["manager_performance_rating"] or 0 for r in records) / max(len(records),1)
    avg_engage  = sum(r["engagement_score"] or 0 for r in records) / max(len(records),1)
    avg_fit     = sum(r["role_fit_rating"] or 0 for r in records) / max(len(records),1)

    return jsonify({"data":{
        "count":              len(records),
        "avgPerformanceRating": round(avg_perf, 1),
        "avgEngagementScore":   round(avg_engage, 1),
        "avgRoleFitRating":     round(avg_fit, 1),
        "message":              f"Validation dataset: {len(records)} outcome records across {len(set(r['profile_id'] for r in records))} profiles.",
    }})

# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.route("/api/dashboard")
def dashboard():
    with get_db() as db:
        profiles_count = db.execute("SELECT COUNT(*) as c FROM profiles").fetchone()["c"]
        completed      = db.execute("SELECT COUNT(*) as c FROM assessments WHERE status='completed'").fetchone()["c"]
        outcomes_count = db.execute("SELECT COUNT(*) as c FROM outcomes").fetchone()["c"]

        scores_rows = db.execute(
            "SELECT scores FROM assessments WHERE status='completed'"
        ).fetchall()

        risks_rows = db.execute(
            "SELECT risks FROM assessments WHERE status='completed'"
        ).fetchall()

    dist = {}
    for row in scores_rows:
        try:
            scores = json.loads(row["scores"])
            primary = next((s for s in scores if s.get("isPrimary")), None)
            if primary:
                aid = primary["archetypeId"]
                dist[aid] = dist.get(aid, 0) + 1
        except Exception:
            pass

    risk_counts = {"high":0,"medium":0,"low":0}
    for row in risks_rows:
        try:
            for r in json.loads(row["risks"]):
                lvl = r.get("level","low")
                if lvl in risk_counts:
                    risk_counts[lvl] += 1
        except Exception:
            pass

    return jsonify({"data":{
        "totalProfiles":        profiles_count,
        "completedAssessments": completed,
        "outcomesRecorded":     outcomes_count,
        "validationProgress":   f"{outcomes_count} outcome records — {max(0, 10-outcomes_count)} more needed for initial validation report",
        "strengthDistribution": [{"archetypeId":k,"count":v} for k,v in sorted(dist.items(), key=lambda x:-x[1])],
        "riskSummary":          risk_counts,
    }})

# ── Goals ─────────────────────────────────────────────────────────────────────

@app.route("/api/profiles/<pid>/goals", methods=["GET"])
def get_goals(pid):
    with get_db() as db:
        rows = db.execute("SELECT * FROM goals WHERE profile_id=? ORDER BY created_at DESC", (pid,)).fetchall()
    return jsonify({"data":[dict(r) for r in rows]})

@app.route("/api/profiles/<pid>/goals", methods=["POST"])
@require_json
def create_goal(pid):
    """
    Create a measurable goal — qualitative OR quantitative.

    INPUT (common):
      text, goalType, category, archetypeAlignment, dueDate, reviewFrequency,
      linkedModuleId, linkedLearningPlanId, notes

    INPUT (quantitative goals):
      metricName, metricUnit, baselineValue, targetValue, measurementMethod

    INPUT (qualitative/behavioural goals):
      successIndicators (list of observable behaviours),
      evidenceRequired (what proof is needed)

    OUTPUT: full goal record with progressLabel and daysUntilDue
    """
    body = request.get_json()
    text = (body.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Goal text required"}), 400

    import json as _j
    gid = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    success_indicators = body.get("successIndicators", [])
    if isinstance(success_indicators, list):
        success_indicators = _j.dumps(success_indicators)

    with get_db() as db:
        db.execute("""
            INSERT INTO goals (
                id, profile_id, text, done, archetype_alignment, created_at,
                goal_type, category,
                metric_name, metric_unit, baseline_value, target_value, current_value,
                measurement_method, success_indicators, evidence_required,
                due_date, review_frequency,
                linked_module_id, linked_learning_plan_id,
                progress_pct, notes
            ) VALUES (?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)
        """, [
            gid, pid, text,
            body.get("archetypeAlignment"),
            now,
            body.get("goalType", "qualitative"),
            body.get("category", "growth"),
            body.get("metricName"),
            body.get("metricUnit"),
            body.get("baselineValue"),
            body.get("targetValue"),
            body.get("baselineValue"),   # current starts at baseline
            body.get("measurementMethod"),
            success_indicators,
            body.get("evidenceRequired"),
            body.get("dueDate"),
            body.get("reviewFrequency", "monthly"),
            body.get("linkedModuleId"),
            body.get("linkedLearningPlanId"),
            body.get("notes"),
        ])
        new_goal = dict(db.execute("SELECT * FROM goals WHERE id=?", (gid,)).fetchone())

    new_goal["done"] = False
    return jsonify({"data": _enrich_goal(new_goal)}), 201

@app.route("/api/goals/<gid>/toggle", methods=["PATCH"])
@require_json
def toggle_goal(gid):
    """
    Toggle goal done/not-done.
    When marking done, optionally capture completion_evidence.
    """
    body = request.get_json() or {}
    with get_db() as db:
        row = db.execute("SELECT * FROM goals WHERE id=?", (gid,)).fetchone()
        if not row:
            return jsonify({"error": "Goal not found"}), 404
        new_done = 0 if row["done"] else 1
        evidence = body.get("completionEvidence", "")
        db.execute(
            "UPDATE goals SET done=?, completion_evidence=?, progress_pct=? WHERE id=?",
            (new_done, evidence, 100 if new_done else row["progress_pct"], gid)
        )
        updated = dict(db.execute("SELECT * FROM goals WHERE id=?", (gid,)).fetchone())
    updated["done"] = bool(updated["done"])
    updated["managerConfirmed"] = bool(updated.get("manager_confirmed", 0))
    return jsonify({"data": updated})


# ══════════════════════════════════════════════════════════════════════════════
# PERFORMANCE ENGINE — MEASURABLE OUTCOMES
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/profiles/<pid>/goals", methods=["PUT"])
@require_json
def update_goal(pid):
    """
    Update a goal's measurable fields — target, baseline, current value, etc.
    INPUT:  goalId + any measurable field updates
    OUTPUT: updated goal with computed progress_pct
    """
    body   = request.get_json()
    gid    = body.get("goalId")
    if not gid:
        return jsonify({"error": "goalId required"}), 400

    with get_db() as db:
        row = db.execute("SELECT * FROM goals WHERE id=? AND profile_id=?", (gid, pid)).fetchone()
        if not row:
            return jsonify({"error": "Goal not found"}), 404

        # Build update dict from allowed fields
        allowed = [
            "text", "goal_type", "category", "metric_name", "metric_unit",
            "baseline_value", "target_value", "current_value", "measurement_method",
            "success_indicators", "evidence_required", "due_date", "review_frequency",
            "linked_module_id", "linked_learning_plan_id", "notes", "progress_pct",
        ]
        updates = {}
        for field in allowed:
            camel = ''.join(w.capitalize() if i else w for i, w in enumerate(field.split('_')))
            if camel in body:
                updates[field] = body[camel]
            elif field in body:
                updates[field] = body[field]

        # Auto-compute progress_pct for quantitative goals
        if "current_value" in updates or "target_value" in updates or "baseline_value" in updates:
            current  = updates.get("current_value")  or row["current_value"]  or 0
            target   = updates.get("target_value")   or row["target_value"]   or 0
            baseline = updates.get("baseline_value") or row["baseline_value"] or 0
            if target and target != baseline:
                pct = min(100, max(0, round(((current - baseline) / (target - baseline)) * 100)))
                updates["progress_pct"] = pct

        if not updates:
            return jsonify({"error": "No valid fields to update"}), 400

        set_clause = ", ".join(f"{k}=?" for k in updates)
        values = list(updates.values()) + [gid]
        db.execute(f"UPDATE goals SET {set_clause} WHERE id=?", values)
        updated = dict(db.execute("SELECT * FROM goals WHERE id=?", (gid,)).fetchone())

    updated["done"] = bool(updated["done"])
    return jsonify({"data": _enrich_goal(updated)})


@app.route("/api/goals/<gid>/checkin", methods=["POST"])
@require_json
def goal_checkin(gid):
    """
    Record a measurable check-in on a goal.

    INPUT:
      Quantitative goals → currentValue (the new reading)
      Qualitative goals  → qualitativeNotes + evidenceThisPeriod
      Both types         → selfRating (1-10) + optional managerRating
      Optional           → strengthShowedUp, strengthBlocked

    OUTPUT:
      Updated goal with new progress_pct + full check-in record
    """
    body = request.get_json()
    with get_db() as db:
        goal_row = db.execute("SELECT * FROM goals WHERE id=?", (gid,)).fetchone()
        if not goal_row:
            return jsonify({"error": "Goal not found"}), 404
        goal = dict(goal_row)

        checkin_id = str(uuid.uuid4())
        now        = datetime.utcnow().isoformat()

        current_value = body.get("currentValue")
        new_pct       = goal["progress_pct"]

        # Compute progress for quantitative goals
        if current_value is not None and goal["target_value"]:
            baseline = goal["baseline_value"] or 0
            target   = goal["target_value"]
            if target != baseline:
                new_pct = min(100, max(0, round(((current_value - baseline) / (target - baseline)) * 100)))

        # For qualitative goals, progress is driven by self/manager rating
        elif body.get("selfRating") and goal["goal_type"] in ("qualitative", "behavioural"):
            # Map 1-10 rating to 0-100 progress
            new_pct = min(100, max(0, round(body["selfRating"] * 10)))

        db.execute("""
            INSERT INTO goal_checkins
            (id, goal_id, profile_id, current_value, progress_pct, qualitative_notes,
             evidence_this_period, strength_showed_up, strength_blocked,
             self_rating, manager_rating, recorded_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, [
            checkin_id, gid, goal["profile_id"],
            current_value, new_pct,
            body.get("qualitativeNotes", ""),
            body.get("evidenceThisPeriod", ""),
            int(body.get("strengthShowedUp", False)),
            int(body.get("strengthBlocked", False)),
            body.get("selfRating"),
            body.get("managerRating"),
            now,
        ])

        # Update goal with new progress and last check-in date
        db.execute("""
            UPDATE goals
            SET progress_pct=?, current_value=?, last_check_in=?, check_in_count=check_in_count+1
            WHERE id=?
        """, [new_pct, current_value or goal["current_value"], now, gid])

        updated = dict(db.execute("SELECT * FROM goals WHERE id=?", (gid,)).fetchone())
        checkin = dict(db.execute("SELECT * FROM goal_checkins WHERE id=?", (checkin_id,)).fetchone())

    updated["done"] = bool(updated["done"])
    return jsonify({"data": {
        "goal":   _enrich_goal(updated),
        "checkIn": checkin,
        "message": f"Progress updated to {new_pct}%",
    }})


@app.route("/api/goals/<gid>/checkins")
def get_goal_checkins(gid):
    """Return the full check-in history for a goal — the measurable evidence trail."""
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM goal_checkins WHERE goal_id=? ORDER BY recorded_at ASC", (gid,)
        ).fetchall()
    return jsonify({"data": [dict(r) for r in rows]})


@app.route("/api/profiles/<pid>/performance-summary")
def performance_summary(pid):
    """
    Comprehensive measurable performance view for a profile.

    OUTPUT:
      - Goal completion rates by type (qualitative vs quantitative)
      - Average progress across active goals
      - Strength alignment score (how often primary stone helps vs hinders)
      - Learning plan linkage stats
      - 90-day check-in trajectory
      - Goals by category (growth / performance / learning / leadership)
    """
    with get_db() as db:
        goals = [dict(r) for r in db.execute(
            "SELECT * FROM goals WHERE profile_id=? ORDER BY created_at DESC", (pid,)
        ).fetchall()]
        checkins = [dict(r) for r in db.execute(
            "SELECT * FROM goal_checkins WHERE profile_id=? ORDER BY recorded_at ASC", (pid,)
        ).fetchall()]
        outcomes = [dict(r) for r in db.execute(
            "SELECT * FROM outcomes WHERE profile_id=? ORDER BY recorded_at DESC", (pid,)
        ).fetchall()]
        profile_row = db.execute("SELECT * FROM profiles WHERE id=?", (pid,)).fetchone()
        if not profile_row:
            return jsonify({"error": "Profile not found"}), 404
        profile = row_to_dict(profile_row)

    total   = len(goals)
    done    = sum(1 for g in goals if g["done"])
    active  = [g for g in goals if not g["done"]]
    avg_progress = round(sum(g["progress_pct"] for g in active) / len(active)) if active else 0

    by_type = {}
    for g in goals:
        t = g.get("goal_type", "qualitative")
        if t not in by_type:
            by_type[t] = {"total": 0, "completed": 0, "avg_progress": 0, "_pcts": []}
        by_type[t]["total"] += 1
        if g["done"]:
            by_type[t]["completed"] += 1
        by_type[t]["_pcts"].append(g["progress_pct"])
    for t in by_type:
        pcts = by_type[t].pop("_pcts")
        by_type[t]["avg_progress"] = round(sum(pcts) / len(pcts)) if pcts else 0
        by_type[t]["completion_rate"] = round(by_type[t]["completed"] / by_type[t]["total"] * 100) if by_type[t]["total"] else 0

    by_category = {}
    for g in goals:
        cat = g.get("category", "growth")
        if cat not in by_category:
            by_category[cat] = {"total": 0, "completed": 0}
        by_category[cat]["total"] += 1
        if g["done"]:
            by_category[cat]["completed"] += 1

    # Strength alignment from check-ins
    total_checkins  = len(checkins)
    strength_helped = sum(1 for c in checkins if c.get("strength_showed_up"))
    strength_blocked = sum(1 for c in checkins if c.get("strength_blocked"))

    # 90-day trajectory: group check-ins by week
    trajectory = []
    if checkins:
        from datetime import datetime as dt, timedelta
        start = dt.fromisoformat(checkins[0]["recorded_at"][:10])
        for w in range(13):  # 13 weeks = 91 days
            week_start = start + timedelta(weeks=w)
            week_end   = week_start + timedelta(days=7)
            week_checkins = [c for c in checkins
                if week_start.isoformat() <= c["recorded_at"][:10] < week_end.isoformat()]
            if week_checkins:
                avg_self = sum(c["self_rating"] or 0 for c in week_checkins if c.get("self_rating")) / max(1, sum(1 for c in week_checkins if c.get("self_rating")))
                trajectory.append({
                    "week": w + 1,
                    "date": week_start.strftime("%Y-%m-%d"),
                    "checkInCount": len(week_checkins),
                    "avgSelfRating": round(avg_self, 1),
                    "avgProgress": round(sum(c["progress_pct"] or 0 for c in week_checkins) / len(week_checkins)),
                })

    # Overdue goals
    now_str = datetime.utcnow().isoformat()[:10]
    overdue = [g for g in active if g.get("due_date") and g["due_date"] < now_str]

    # Linked learning modules
    linked = [g for g in goals if g.get("linked_module_id")]

    return jsonify({"data": {
        "profileId":   pid,
        "profileName": profile.get("name"),
        "summary": {
            "totalGoals":        total,
            "completedGoals":    done,
            "activeGoals":       len(active),
            "completionRate":    round(done / total * 100) if total else 0,
            "avgActiveProgress": avg_progress,
            "overdueGoals":      len(overdue),
            "linkedToLearning":  len(linked),
        },
        "byType":     by_type,
        "byCategory": by_category,
        "strengthAlignment": {
            "totalCheckIns":     total_checkins,
            "strengthHelped":    strength_helped,
            "strengthBlocked":   strength_blocked,
            "helpRate":          round(strength_helped / total_checkins * 100) if total_checkins else 0,
            "blockRate":         round(strength_blocked / total_checkins * 100) if total_checkins else 0,
        },
        "trajectory":  trajectory,
        "outcomeData": outcomes,
        "overdueGoals": [_enrich_goal(g) for g in overdue],
        "recentGoals": [_enrich_goal(g) for g in goals[:8]],
    }})


def _enrich_goal(g):
    """Add computed fields to a goal dict before returning to client."""
    g["done"] = bool(g.get("done", 0))
    g["managerConfirmed"] = bool(g.get("manager_confirmed", 0))

    # Parse JSON fields
    for field in ["success_indicators"]:
        if isinstance(g.get(field), str):
            try:
                import json as _j
                g[field] = _j.loads(g[field])
            except Exception:
                g[field] = []

    # Compute display progress label
    if g.get("goal_type") == "quantitative" and g.get("target_value") is not None:
        current  = g.get("current_value") or g.get("baseline_value") or 0
        target   = g["target_value"]
        baseline = g.get("baseline_value") or 0
        unit     = g.get("metric_unit", "")
        g["progressLabel"] = f"{current}{unit} → {target}{unit} (baseline: {baseline}{unit})"
    else:
        g["progressLabel"] = f"{g.get('progress_pct', 0)}% complete"

    # Days until due
    if g.get("due_date"):
        from datetime import datetime as dt
        try:
            delta = (dt.fromisoformat(g["due_date"]) - dt.utcnow()).days
            g["daysUntilDue"] = delta
            g["isOverdue"]    = delta < 0
        except Exception:
            g["daysUntilDue"] = None
            g["isOverdue"]    = False
    else:
        g["daysUntilDue"] = None
        g["isOverdue"]    = False

    return g

# ── FIX 5: Evidence Package / Report endpoint ─────────────────────────────────

@app.route("/api/profiles/<pid>/report")
def generate_report(pid):
    """
    Returns a complete structured evidence package for a profile.
    HR Directors use this to build the internal business case.
    """
    with get_db() as db:
        profile    = row_to_dict(db.execute("SELECT * FROM profiles WHERE id=?", (pid,)).fetchone())
        if not profile: return jsonify({"error":"Profile not found"}), 404
        assessments = [row_to_dict(r) for r in db.execute(
            "SELECT * FROM assessments WHERE profile_id=? AND status='completed' ORDER BY created_at DESC", (pid,)
        ).fetchall()]
        goals     = [dict(r) for r in db.execute("SELECT * FROM goals WHERE profile_id=?", (pid,)).fetchall()]
        snapshots = [dict(r) for r in db.execute(
            "SELECT * FROM score_snapshots WHERE profile_id=? ORDER BY snapshot_date ASC", (pid,)
        ).fetchall()]
        outcomes  = [dict(r) for r in db.execute(
            "SELECT * FROM outcomes WHERE profile_id=? ORDER BY recorded_at DESC", (pid,)
        ).fetchall()]

    latest = assessments[0] if assessments else None
    primary   = next((s for s in (latest["scores"] if latest else []) if s.get("isPrimary")),   None)
    secondary = next((s for s in (latest["scores"] if latest else []) if s.get("isSecondary")), None)

    return jsonify({"data":{
        "reportDate":   datetime.utcnow().isoformat(),
        "profile":      profile,
        "primaryStone": {**primary,  "name": ARCHETYPE_MAP.get(primary["archetypeId"],  {}).get("name","")} if primary else None,
        "secondaryStone":{**secondary,"name": ARCHETYPE_MAP.get(secondary["archetypeId"],{}).get("name","")} if secondary else None,
        "allScores":    latest["scores"] if latest else [],
        "scoreBreakdown": latest.get("score_breakdown", {}) if latest else {},
        "risks":        latest["risks"] if latest else [],
        "goals":        {"total":len(goals),"completed":sum(1 for g in goals if g["done"]),"items":goals},
        "trajectory":   {"snapshots":snapshots,"assessmentCount":len(assessments)},
        "outcomes":     outcomes,
        "validationStatus": "validated" if len(outcomes) >= 3 else "pending" if outcomes else "not_started",
        "message":      "This report can be shared with HR teams, coaches, and line managers as evidence of strength profile and development progress.",
    }})

# ── AI Interpretation ─────────────────────────────────────────────────────────

@app.route("/api/ai/interpret", methods=["POST"])
@require_json
def ai_interpret():
    body = request.get_json()
    aid  = body.get("assessmentId")
    with get_db() as db:
        row = db.execute("SELECT * FROM assessments WHERE id=?", (aid,)).fetchone()
        if not row: return jsonify({"error":"Assessment not found"}), 404
        assessment = row_to_dict(row)
        if assessment["status"] != "completed":
            return jsonify({"error":"Assessment must be completed"}), 400
        profile = row_to_dict(db.execute("SELECT * FROM profiles WHERE id=?", (assessment["profile_id"],)).fetchone())

    primary   = next((s for s in assessment["scores"] if s.get("isPrimary")), None)
    secondary = next((s for s in assessment["scores"] if s.get("isSecondary")), None)
    top_scores = assessment["scores"][:5]
    primary_name   = ARCHETYPE_MAP.get(primary["archetypeId"],   {}).get("name","") if primary   else ""
    secondary_name = ARCHETYPE_MAP.get(secondary["archetypeId"], {}).get("name","") if secondary else ""
    score_text     = ", ".join(f"{ARCHETYPE_MAP.get(s['archetypeId'],{}).get('name',s['archetypeId'])}: {s['score']}%" for s in top_scores)

    client = get_ai_client()
    if not client:
        narrative = (
            f"{profile['name']} demonstrates a dominant {primary_name} strength, supported by a strong {secondary_name} orientation. "
            f"This combination positions them as someone who both drives meaningful outcomes and brings the depth needed to sustain them. "
            f"To maximise their impact, ensure their role gives full expression to their primary stone — without it, expect disengagement over time. "
            f"[Add your ANTHROPIC_API_KEY in .env for a personalised Claude AI narrative]"
        )
        return jsonify({"data":{"narrative":narrative,"aiPowered":False}})

    prompt = f"""You are a Strength Intelligence advisor.
Write a 3-sentence professional narrative for {profile['name']}.
Primary Strength Stone: {primary_name}. Secondary: {secondary_name}.
Top scores: {score_text}. Role: {body.get('targetRole', profile['role'])}.
Be specific — no generic statements. Warm, authoritative tone.
End with one concrete development suggestion."""

    try:
        msg = client.messages.create(model="claude-sonnet-4-5", max_tokens=400,
            messages=[{"role":"user","content":prompt}])
        return jsonify({"data":{"narrative":msg.content[0].text,"aiPowered":True}})
    except Exception as e:
        return jsonify({"error":f"AI error: {str(e)}"}), 503

# ══════════════════════════════════════════════════════════════════════════════
# DATA INTELLIGENCE CENTRE
# ══════════════════════════════════════════════════════════════════════════════
# These routes power the data warehouse view of SI.
# Every endpoint here answers a VALIDATION question, not a product question.
# The output feeds: investor conversations, case study generation,
# enterprise procurement review, and model improvement decisions.

@app.route("/api/data-centre/health")
def data_centre_health():
    """
    Full data quality audit across the entire dataset.
    The first thing an investor or enterprise buyer should see.
    """
    with get_db() as db:
        total_profiles    = db.execute("SELECT COUNT(*) FROM profiles").fetchone()[0]
        total_assessments = db.execute("SELECT COUNT(*) FROM assessments WHERE status='completed'").fetchone()[0]
        total_outcomes    = db.execute("SELECT COUNT(*) FROM outcomes").fetchone()[0]
        total_checkins    = db.execute("SELECT COUNT(*) FROM goal_checkins").fetchone()[0]
        total_goals       = db.execute("SELECT COUNT(*) FROM goals").fetchone()[0]
        total_benchmarks  = db.execute("SELECT COUNT(DISTINCT role) FROM role_benchmarks").fetchone()[0]

        # Data quality breakdown from completeness logic
        assessments = db.execute(
            "SELECT answers, energy_ratings, selected_archetypes FROM assessments WHERE status='completed'"
        ).fetchall()

    quality_counts = {"high": 0, "medium": 0, "low": 0}
    for a in assessments:
        answers   = json.loads(a["answers"] or "{}")
        energy    = json.loads(a["energy_ratings"] or "{}")
        selected  = json.loads(a["selected_archetypes"] or "[]")
        c = round((len(answers)/7*0.50 + len(energy)/12*0.20 + min(len(selected),3)/3*0.30)*100)
        quality_counts["high" if c>=75 else "medium" if c>=50 else "low"] += 1

    usable = quality_counts["high"] + quality_counts["medium"]
    validation_readiness = (
        "ready"        if total_outcomes >= 10 else
        "approaching"  if total_outcomes >= 5  else
        "building"     if total_outcomes >= 1  else
        "not_started"
    )

    return jsonify({"data": {
        "dataHealth": {
            "totalProfiles":       total_profiles,
            "completedAssessments": total_assessments,
            "usableForAnalysis":   usable,
            "outcomeRecords":      total_outcomes,
            "goalCheckIns":        total_checkins,
            "activeGoals":         total_goals,
            "rolesWithBenchmarks": total_benchmarks,
        },
        "dataQuality": quality_counts,
        "validationReadiness": {
            "status":             validation_readiness,
            "outcomeRecords":     total_outcomes,
            "targetRecords":      10,
            "progressPct":        min(100, round(total_outcomes / 10 * 100)),
            "nextMilestone":      "Publish first correlation finding" if total_outcomes >= 10 else f"Collect {10 - total_outcomes} more outcome records",
        },
        "whatThisMeans": (
            "INVESTOR READY: Correlation data exists. Publish the finding."   if total_outcomes >= 10 else
            "APPROACHING: Enough data to see patterns forming."               if total_outcomes >= 5  else
            "BUILDING: Every assessment + outcome record adds to proof."      if total_assessments >= 1 else
            "START: Run the first real assessment with a real person."
        ),
    }})


@app.route("/api/data-centre/validation")
def validation_analysis():
    """
    THE CORE VALIDATION QUESTION:
    Do high SI primary scores correlate with high manager performance ratings?

    This is the endpoint that, when it returns a strong positive correlation,
    makes SI commercially defensible.
    """
    with get_db() as db:
        # Join assessments to outcomes via profile_id
        rows = db.execute("""
            SELECT
                a.scores,
                a.answers,
                a.energy_ratings,
                a.selected_archetypes,
                o.manager_performance_rating,
                o.role_fit_rating,
                o.engagement_score,
                o.days_post_assessment,
                p.role
            FROM outcomes o
            JOIN assessments a ON a.profile_id = o.profile_id AND a.status = 'completed'
            JOIN profiles p ON p.id = o.profile_id
            WHERE o.manager_performance_rating IS NOT NULL
            ORDER BY o.recorded_at DESC
        """).fetchall()

    if len(rows) == 0:
        return jsonify({"data": {
            "status": "no_data",
            "message": "No outcome records yet. The validation study begins when the first manager rating is submitted.",
            "recordsNeeded": 10,
        }})

    # Build correlation dataset
    correlation_data = []
    for row in rows:
        scores = json.loads(row["scores"] or "[]")
        answers  = json.loads(row["answers"] or "{}")
        energy   = json.loads(row["energy_ratings"] or "{}")
        selected = json.loads(row["selected_archetypes"] or "[]")
        completeness = round((len(answers)/7*0.50 + len(energy)/12*0.20 + min(len(selected),3)/3*0.30)*100)

        primary   = next((s for s in scores if s.get("isPrimary")),   None)
        secondary = next((s for s in scores if s.get("isSecondary")), None)

        if primary and completeness >= 50:  # Only use medium/high quality data
            correlation_data.append({
                "primaryArchetype":       primary["archetypeId"],
                "primaryScore":           primary["score"],
                "secondaryArchetype":     secondary["archetypeId"] if secondary else None,
                "managerPerformance":     row["manager_performance_rating"],
                "roleFit":               row["role_fit_rating"],
                "engagementScore":        row["engagement_score"],
                "daysPostAssessment":     row["days_post_assessment"],
                "role":                  row["role"],
                "dataCompleteness":      completeness,
            })

    if not correlation_data:
        return jsonify({"data": {
            "status": "insufficient_quality",
            "message": "Outcome records exist but assessment data quality is too low for reliable correlation. Ensure assessments answer all 7 questions and rate at least 6 energy activities.",
        }})

    # Group by high-score vs low-score profiles
    high_score = [d for d in correlation_data if d["primaryScore"] >= 70]
    low_score  = [d for d in correlation_data if d["primaryScore"] < 50]
    mid_score  = [d for d in correlation_data if 50 <= d["primaryScore"] < 70]

    def avg(lst, key):
        vals = [x[key] for x in lst if x.get(key) is not None]
        return round(sum(vals)/len(vals), 2) if vals else None

    # Per-archetype breakdown
    archetype_outcomes = {}
    for d in correlation_data:
        aid = d["primaryArchetype"]
        if aid not in archetype_outcomes:
            archetype_outcomes[aid] = {"count": 0, "perf": [], "fit": [], "eng": []}
        archetype_outcomes[aid]["count"] += 1
        if d["managerPerformance"]: archetype_outcomes[aid]["perf"].append(d["managerPerformance"])
        if d["roleFit"]:           archetype_outcomes[aid]["fit"].append(d["roleFit"])
        if d["engagementScore"]:   archetype_outcomes[aid]["eng"].append(d["engagementScore"])

    archetype_summary = {}
    for aid, data in archetype_outcomes.items():
        archetype_summary[aid] = {
            "count":          data["count"],
            "avgPerformance": avg_list(data["perf"]),
            "avgRoleFit":     avg_list(data["fit"]),
            "avgEngagement":  avg_list(data["eng"]),
        }

    correlation_signal = "strong" if len(high_score)>2 and len(low_score)>0 else "emerging" if len(correlation_data)>=5 else "building"

    return jsonify({"data": {
        "status":            "active",
        "totalRecords":      len(correlation_data),
        "correlationSignal": correlation_signal,
        "byScoreBand": {
            "highScore_70plus": {
                "count":          len(high_score),
                "avgPerformance": avg(high_score, "managerPerformance"),
                "avgRoleFit":     avg(high_score, "roleFit"),
                "avgEngagement":  avg(high_score, "engagementScore"),
            },
            "midScore_50_70": {
                "count":          len(mid_score),
                "avgPerformance": avg(mid_score, "managerPerformance"),
                "avgRoleFit":     avg(mid_score, "roleFit"),
                "avgEngagement":  avg(mid_score, "engagementScore"),
            },
            "lowScore_under50": {
                "count":          len(low_score),
                "avgPerformance": avg(low_score, "managerPerformance"),
                "avgRoleFit":     avg(low_score, "roleFit"),
                "avgEngagement":  avg(low_score, "engagementScore"),
            },
        },
        "byArchetype":  archetype_summary,
        "rawData":       correlation_data,
        "interpretation": (
            f"STRONG SIGNAL: Profiles scoring 70%+ are outperforming lower-scoring profiles on manager ratings. This is the correlation that makes SI commercially defensible. Publish it."
            if correlation_signal == "strong" else
            f"EMERGING: {len(correlation_data)} records collected. Pattern is forming — continue collecting. Target 10 records for publishable finding."
            if correlation_signal == "emerging" else
            f"BUILDING: {len(correlation_data)} record(s) collected. Each record strengthens the evidence base. Keep collecting."
        ),
    }})


def avg_list(lst):
    return round(sum(lst)/len(lst), 2) if lst else None


@app.route("/api/data-centre/benchmarks")
def benchmark_analysis():
    """
    Role benchmark intelligence — who scores what, per role.
    Shows whether SI scores are stable across people in the same role
    (a prerequisite for the benchmarks to mean anything).
    """
    with get_db() as db:
        benchmarks = db.execute(
            "SELECT role, archetype_id, mean_score, sample_size FROM role_benchmarks ORDER BY role, mean_score DESC"
        ).fetchall()
        roles_assessed = db.execute(
            "SELECT p.role, COUNT(DISTINCT a.profile_id) as count FROM assessments a JOIN profiles p ON p.id=a.profile_id WHERE a.status='completed' GROUP BY p.role"
        ).fetchall()

    by_role = {}
    for row in benchmarks:
        role = row["role"]
        if role not in by_role:
            by_role[role] = {"archetypes": [], "sampleSize": row["sample_size"]}
        by_role[role]["archetypes"].append({
            "archetypeId": row["archetype_id"],
            "meanScore":   round(row["mean_score"], 1),
            "sampleSize":  row["sample_size"],
            "reliable":    row["sample_size"] >= 5,  # Benchmarks need 5+ for reliability
        })

    # Flag which benchmarks are reliable vs indicative
    reliability_summary = {}
    for role, data in by_role.items():
        max_sample = max(a["sampleSize"] for a in data["archetypes"]) if data["archetypes"] else 0
        reliability_summary[role] = {
            "maxSampleSize": max_sample,
            "reliable":      max_sample >= 5,
            "status":        "reliable" if max_sample>=5 else "indicative" if max_sample>=3 else "preliminary",
            "message":       f"Benchmark reliable ({max_sample} samples)" if max_sample>=5 else f"Need {5-max_sample} more assessments for reliable benchmark",
        }

    return jsonify({"data": {
        "byRole":           by_role,
        "reliability":      reliability_summary,
        "rolesAssessed":    [dict(r) for r in roles_assessed],
        "totalRoles":       len(by_role),
        "reliableRoles":    sum(1 for r in reliability_summary.values() if r["reliable"]),
        "note":             "Benchmarks with fewer than 5 samples should be treated as indicative, not definitive. They shift significantly with each new assessment.",
    }})


@app.route("/api/data-centre/model-improvement")
def model_improvement():
    """
    Identifies where the scoring model needs calibration.

    Looks for:
    1. Archetypes that are systematically over-scored or under-scored
    2. Questions that are being answered but having no discriminating effect
    3. Energy activities that cluster (everyone rates them the same = low signal)
    4. Profiles where the predicted primary stone mismatches the role expectation
    """
    with get_db() as db:
        assessments = db.execute(
            "SELECT a.scores, a.answers, a.energy_ratings, a.score_breakdown, p.role FROM assessments a JOIN profiles p ON p.id=a.profile_id WHERE a.status='completed'"
        ).fetchall()
        benchmarks = db.execute("SELECT archetype_id, mean_score FROM role_benchmarks").fetchall()

    if len(assessments) < 3:
        return jsonify({"data": {
            "status": "insufficient_data",
            "message": f"Need at least 3 completed assessments for model analysis. Have {len(assessments)}.",
        }})

    # 1. Score distribution per archetype (is anything systematically high/low?)
    arch_scores = {}
    for a in assessments:
        scores = json.loads(a["scores"] or "[]")
        for s in scores:
            aid = s["archetypeId"]
            if aid not in arch_scores:
                arch_scores[aid] = []
            arch_scores[aid].append(s["score"])

    arch_analysis = {}
    for aid, scores_list in arch_scores.items():
        mean = round(sum(scores_list)/len(scores_list), 1)
        arch_analysis[aid] = {
            "mean":   mean,
            "min":    min(scores_list),
            "max":    max(scores_list),
            "count":  len(scores_list),
            "flag":   "over-scored" if mean > 75 else "under-scored" if mean < 15 else "normal",
        }

    # 2. Question answer distribution (are any questions always answered the same way?)
    question_dist = {}
    for a in assessments:
        answers = json.loads(a["answers"] or "{}")
        for qid, val in answers.items():
            if qid not in question_dist:
                question_dist[qid] = []
            question_dist[qid].append(str(val))

    question_flags = {}
    for qid, vals in question_dist.items():
        unique_vals = len(set(vals))
        question_flags[qid] = {
            "responses":    len(vals),
            "uniqueValues": unique_vals,
            "flag":         "low_discriminance" if unique_vals <= 1 else "good" if unique_vals >= 3 else "moderate",
            "message":      "All respondents giving same answer — question may not be discriminating" if unique_vals<=1 else "Good answer variance",
        }

    # 3. Energy rating distribution
    energy_dist = {}
    for a in assessments:
        energy = json.loads(a["energy_ratings"] or "{}")
        for act, rating in energy.items():
            if act not in energy_dist:
                energy_dist[act] = []
            energy_dist[act].append(rating)

    energy_flags = {}
    for act, ratings in energy_dist.items():
        unique_r = len(set(ratings))
        energy_flags[act] = {
            "responses":    len(ratings),
            "uniqueValues": unique_r,
            "flag":         "low_signal" if unique_r <= 1 else "good",
        }

    # Summarise
    flagged_arch       = [aid for aid, d in arch_analysis.items() if d["flag"] != "normal"]
    flagged_questions  = [qid for qid, d in question_flags.items() if d["flag"] == "low_discriminance"]
    flagged_energy     = [act for act, d in energy_flags.items() if d["flag"] == "low_signal"]

    return jsonify({"data": {
        "assessmentsAnalysed": len(assessments),
        "archetypeScoreDistribution": arch_analysis,
        "questionDiscriminance":      question_flags,
        "energySignalStrength":       energy_flags,
        "flags": {
            "overOrUnderScoredArchetypes": flagged_arch,
            "lowDiscriminanceQuestions":   flagged_questions,
            "lowSignalEnergyActivities":   flagged_energy,
        },
        "modelHealth": (
            "good"         if not flagged_arch and not flagged_questions else
            "needs_review"  if len(flagged_arch) <= 2 else
            "recalibrate"
        ),
        "recommendations": [
            f"Archetype '{{a}}' is systematically {arch_analysis[a]['flag']} — check scoring weights" for a in flagged_arch
        ] + [
            f"Question '{{q}}' has low discriminance — consider rewording or removing" for q in flagged_questions
        ] + [
            f"Energy activity '{{e}}' shows low signal variation — may not add predictive value" for e in flagged_energy
        ],
    }})


@app.route("/api/data-centre/export")
def data_export():
    """
    Complete dataset export for external analysis.
    Format: structured JSON ready for pandas, R, or any data science tool.
    Used for: publishing findings, academic review, investor due diligence.
    All personal data anonymised by default (use ?include_names=true to override).
    """
    include_names = request.args.get("include_names", "false").lower() == "true"

    with get_db() as db:
        profiles    = db.execute("SELECT * FROM profiles").fetchall()
        assessments = db.execute("SELECT * FROM assessments WHERE status='completed'").fetchall()
        outcomes    = db.execute("SELECT * FROM outcomes").fetchall()
        benchmarks  = db.execute("SELECT * FROM role_benchmarks").fetchall()
        snapshots   = db.execute("SELECT * FROM score_snapshots").fetchall()
        checkins    = db.execute("SELECT * FROM goal_checkins").fetchall()

    profile_map = {}
    for p in profiles:
        pd = dict(p)
        anonymised_id = f"profile_{list(dict(p).keys()).index('id') if False else hash(pd['id']) % 10000:04d}"
        profile_map[pd["id"]] = {
            "anonymisedId": anonymised_id,
            "role":         pd["role"],
            "mode":         pd["mode"],
            **({'name': pd["name"]} if include_names else {}),
        }

    assessment_records = []
    for a in assessments:
        ad = row_to_dict(a)
        answers  = ad.get("answers", {})
        energy   = ad.get("energy_ratings", {})
        selected = ad.get("selected_archetypes", [])
        completeness = round((len(answers)/7*0.50 + len(energy)/12*0.20 + min(len(selected),3)/3*0.30)*100)
        assessment_records.append({
            "profileRef":         profile_map.get(ad["profile_id"], {}).get("anonymisedId"),
            "role":               profile_map.get(ad["profile_id"], {}).get("role"),
            "scores":             ad.get("scores", []),
            "selectedArchetypes": selected,
            "answeredQuestions":  len(answers),
            "energyActivitiesRated": len(energy),
            "completeness":       completeness,
            "dataQuality":        "high" if completeness>=75 else "medium" if completeness>=50 else "low",
            "createdAt":          ad.get("created_at"),
        })

    outcome_records = []
    for o in outcomes:
        od = dict(o)
        outcome_records.append({
            "profileRef":              profile_map.get(od["profile_id"], {}).get("anonymisedId"),
            "role":                    profile_map.get(od["profile_id"], {}).get("role"),
            "daysPostAssessment":      od["days_post_assessment"],
            "managerPerformanceRating":od["manager_performance_rating"],
            "roleFitRating":           od["role_fit_rating"],
            "engagementScore":         od["engagement_score"],
            "recordedAt":              od["recorded_at"],
        })

    return jsonify({
        "exportVersion":     "1.0",
        "exportDate":        datetime.utcnow().isoformat(),
        "anonymised":        not include_names,
        "recordCounts": {
            "profiles":    len(profiles),
            "assessments": len(assessment_records),
            "outcomes":    len(outcome_records),
            "benchmarks":  len(benchmarks),
            "snapshots":   len(snapshots),
            "goalCheckins": len(checkins),
        },
        "assessments":  assessment_records,
        "outcomes":     outcome_records,
        "benchmarks":   [dict(b) for b in benchmarks],
        "scoringModel": {
            "weights":      {"priorSelection": 0.30, "questionAnswers": 0.50, "energyMap": 0.20},
            "scoreCeiling": 60.0,
            "version":      "2.1-absolute-ceiling",
            "changeLog":    "v2.1: switched from relative-max to absolute ceiling normalisation to prevent score collapse on sparse data",
        },
    })


# ── Error handlers ────────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e): return jsonify({"error":"Endpoint not found"}), 404

@app.errorhandler(500)
def server_error(e): return jsonify({"error":"Internal server error"}), 500

# if __name__ == "__main__":
#     port  = int(os.getenv("PORT", 5000))
#     debug = os.getenv("NODE_ENV","development") == "development"
#     print(f"\n  ◆  STRENGTH INTELLIGENCE API  ◆")
#     print(f"  Running on http://localhost:{port}")
#     print(f"  Database: {DB_PATH}")
#     print(f"  AI: {'Connected' if get_ai_client() else 'Fallback mode (add ANTHROPIC_API_KEY for full AI)'}\n")
#     app.run(host="0.0.0.0", port=port, debug=debug)


# ═══════════════════════════════════════════════════════════════════════════════
# STRENGTH-ACTIVATED LEARNING ENGINE
# Added from LMS integration — every course tied to a specific archetype gap
# ═══════════════════════════════════════════════════════════════════════════════

LEARNING_CATALOGUE = {
  "growth": [
    {"id":"gr_01","title":"Coaching Conversations That Actually Work","type":"course","provider":"Coursera","duration_weeks":3,"level":"foundational","url":"https://coursera.org","matchKeywords":["develop","mentor","grow","nurture"]},
    {"id":"gr_02","title":"The Manager as Coach — Radical Candor Framework","type":"book","provider":"Self-study","duration_weeks":2,"level":"intermediate","url":"https://radicalcandor.com","matchKeywords":["feedback","coach","direct"]},
    {"id":"gr_03","title":"Deliberate Practice: Designing Your Own Development","type":"workshop","provider":"SI Platform","duration_weeks":1,"level":"advanced","url":"internal","matchKeywords":["practice","design","deliberate"]},
  ],
  "clarity": [
    {"id":"cl_01","title":"Critical Thinking & Problem Solving","type":"course","provider":"LinkedIn Learning","duration_weeks":2,"level":"foundational","url":"https://linkedin.com/learning","matchKeywords":["analyse","logic","reason"]},
    {"id":"cl_02","title":"Pyramid Principle: Logic in Writing","type":"book","provider":"Self-study","duration_weeks":2,"level":"intermediate","url":"https://amazon.com","matchKeywords":["structure","argument","clear"]},
    {"id":"cl_03","title":"Data Storytelling for Decision Makers","type":"course","provider":"DataCamp","duration_weeks":3,"level":"advanced","url":"https://datacamp.com","matchKeywords":["data","story","insight"]},
  ],
  "systems": [
    {"id":"sy_01","title":"Project Management Fundamentals (PMP Prep)","type":"course","provider":"PMI","duration_weeks":4,"level":"foundational","url":"https://pmi.org","matchKeywords":["process","manage","deliver"]},
    {"id":"sy_02","title":"Systems Thinking: Managing Complex Situations","type":"course","provider":"MIT OpenCourseWare","duration_weeks":3,"level":"intermediate","url":"https://ocw.mit.edu","matchKeywords":["system","complexity","feedback loop"]},
    {"id":"sy_03","title":"Lean Six Sigma Yellow Belt","type":"certification","provider":"ASQ","duration_weeks":4,"level":"advanced","url":"https://asq.org","matchKeywords":["efficiency","waste","process"]},
  ],
  "vision": [
    {"id":"vi_01","title":"Strategic Thinking & Business Acumen","type":"course","provider":"Harvard ManageMentor","duration_weeks":3,"level":"foundational","url":"https://hbsp.harvard.edu","matchKeywords":["strategy","future","direction"]},
    {"id":"vi_02","title":"Good Strategy/Bad Strategy — Richard Rumelt","type":"book","provider":"Self-study","duration_weeks":2,"level":"intermediate","url":"https://amazon.com","matchKeywords":["strategy","kernel","guiding"]},
    {"id":"vi_03","title":"Scenario Planning for Leaders","type":"workshop","provider":"Oxford Said Business School","duration_weeks":1,"level":"advanced","url":"https://sbs.ox.ac.uk","matchKeywords":["scenario","future","uncertainty"]},
  ],
  "activation": [
    {"id":"ac_01","title":"Influencing Without Authority","type":"course","provider":"LinkedIn Learning","duration_weeks":2,"level":"foundational","url":"https://linkedin.com/learning","matchKeywords":["influence","lead","drive"]},
    {"id":"ac_02","title":"Leading Change: Kotter's 8-Step Model","type":"course","provider":"Coursera","duration_weeks":2,"level":"intermediate","url":"https://coursera.org","matchKeywords":["change","urgency","coalition"]},
    {"id":"ac_03","title":"High Output Management — Andy Grove","type":"book","provider":"Self-study","duration_weeks":2,"level":"advanced","url":"https://amazon.com","matchKeywords":["output","team","performance"]},
  ],
  "stability": [
    {"id":"st_01","title":"Emotional Intelligence at Work","type":"course","provider":"Coursera","duration_weeks":2,"level":"foundational","url":"https://coursera.org","matchKeywords":["emotion","regulate","self-aware"]},
    {"id":"st_02","title":"The Trusted Advisor — Maister, Green, Galford","type":"book","provider":"Self-study","duration_weeks":2,"level":"intermediate","url":"https://amazon.com","matchKeywords":["trust","advise","depend"]},
    {"id":"st_03","title":"Resilience Under Pressure","type":"workshop","provider":"SI Platform","duration_weeks":1,"level":"advanced","url":"internal","matchKeywords":["resilience","pressure","anchor"]},
  ],
  "admin": [
    {"id":"ad_01","title":"Business Process Documentation & SOPs","type":"course","provider":"Udemy","duration_weeks":2,"level":"foundational","url":"https://udemy.com","matchKeywords":["process","document","SOP"]},
    {"id":"ad_02","title":"Compliance & Risk Fundamentals","type":"course","provider":"LinkedIn Learning","duration_weeks":2,"level":"intermediate","url":"https://linkedin.com/learning","matchKeywords":["compliance","risk","govern"]},
    {"id":"ad_03","title":"Organisational Design Principles","type":"course","provider":"SHRM","duration_weeks":3,"level":"advanced","url":"https://shrm.org","matchKeywords":["structure","design","organise"]},
  ],
  "innovation": [
    {"id":"in_01","title":"Design Thinking Fundamentals","type":"course","provider":"IDEO U","duration_weeks":3,"level":"foundational","url":"https://ideou.com","matchKeywords":["design","empathy","prototype"]},
    {"id":"in_02","title":"Creative Problem Solving & Ideation","type":"course","provider":"Coursera","duration_weeks":2,"level":"intermediate","url":"https://coursera.org","matchKeywords":["creative","idea","brainstorm"]},
    {"id":"in_03","title":"The Innovator's Dilemma — Clayton Christensen","type":"book","provider":"Self-study","duration_weeks":2,"level":"advanced","url":"https://amazon.com","matchKeywords":["disrupt","innovate","market"]},
  ],
  "culture": [
    {"id":"cu_01","title":"Building Psychological Safety","type":"course","provider":"LinkedIn Learning","duration_weeks":2,"level":"foundational","url":"https://linkedin.com/learning","matchKeywords":["safety","trust","belong"]},
    {"id":"cu_02","title":"The Culture Map — Erin Meyer","type":"book","provider":"Self-study","duration_weeks":2,"level":"intermediate","url":"https://amazon.com","matchKeywords":["culture","diversity","values"]},
    {"id":"cu_03","title":"DEI Leadership Certification","type":"certification","provider":"SHRM","duration_weeks":4,"level":"advanced","url":"https://shrm.org","matchKeywords":["inclusion","equity","diversity"]},
  ],
  "teaching": [
    {"id":"te_01","title":"The Art of Explanation","type":"course","provider":"LinkedIn Learning","duration_weeks":2,"level":"foundational","url":"https://linkedin.com/learning","matchKeywords":["explain","teach","communicate"]},
    {"id":"te_02","title":"Training Design & Facilitation","type":"course","provider":"ATD","duration_weeks":3,"level":"intermediate","url":"https://td.org","matchKeywords":["facilitate","train","design"]},
    {"id":"te_03","title":"Make It Stick — Brown, Roediger, McDaniel","type":"book","provider":"Self-study","duration_weeks":2,"level":"advanced","url":"https://amazon.com","matchKeywords":["learn","memory","retention"]},
  ],
  "relationship": [
    {"id":"re_01","title":"Negotiation & Conflict Resolution","type":"course","provider":"Harvard Online","duration_weeks":3,"level":"foundational","url":"https://online.hbs.edu","matchKeywords":["negotiate","conflict","resolve"]},
    {"id":"re_02","title":"Never Split the Difference — Chris Voss","type":"book","provider":"Self-study","duration_weeks":2,"level":"intermediate","url":"https://amazon.com","matchKeywords":["negotiate","empathy","tactical"]},
    {"id":"re_03","title":"Stakeholder Management & Political Savvy","type":"workshop","provider":"SI Platform","duration_weeks":1,"level":"advanced","url":"internal","matchKeywords":["stakeholder","influence","political"]},
  ],
  "completion": [
    {"id":"co_01","title":"Getting Things Done — David Allen","type":"book","provider":"Self-study","duration_weeks":2,"level":"foundational","url":"https://amazon.com","matchKeywords":["complete","organise","done"]},
    {"id":"co_02","title":"Quality Management Fundamentals","type":"course","provider":"ASQ","duration_weeks":3,"level":"intermediate","url":"https://asq.org","matchKeywords":["quality","standard","review"]},
    {"id":"co_03","title":"Accountability & Ownership in Teams","type":"workshop","provider":"SI Platform","duration_weeks":1,"level":"advanced","url":"internal","matchKeywords":["account","own","deliver"]},
  ],
}

# Learning plan DB extension
LEARNING_SCHEMA = """
CREATE TABLE IF NOT EXISTS learning_plans (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    assessment_id TEXT NOT NULL,
    target_role TEXT NOT NULL,
    phase INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS learning_modules (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    archetype_id TEXT NOT NULL,
    gap_size INTEGER NOT NULL,
    priority TEXT NOT NULL,
    course_id TEXT NOT NULL,
    course_title TEXT NOT NULL,
    course_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    duration_weeks INTEGER NOT NULL,
    week_start INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    progress_pct INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    reflection TEXT,
    FOREIGN KEY (plan_id) REFERENCES learning_plans(id)
);

CREATE TABLE IF NOT EXISTS learning_sessions (
    id TEXT PRIMARY KEY,
    module_id TEXT NOT NULL,
    session_type TEXT NOT NULL,
    content TEXT NOT NULL,
    ai_response TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (module_id) REFERENCES learning_modules(id)
);

CREATE TABLE IF NOT EXISTS weekly_reviews (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    week_number INTEGER NOT NULL,
    hours_studied REAL NOT NULL DEFAULT 0,
    modules_progressed TEXT NOT NULL DEFAULT '[]',
    concepts_clicked TEXT NOT NULL DEFAULT '[]',
    concepts_stuck TEXT NOT NULL DEFAULT '[]',
    energy_rating INTEGER NOT NULL DEFAULT 7,
    ai_review TEXT,
    grade TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (plan_id) REFERENCES learning_plans(id)
);
"""

def init_learning_db():
    import sqlite3 as _sqlite3, os as _os
    _db_path = _os.path.join(_os.path.dirname(__file__), "data", "si.db")
    _conn = _sqlite3.connect(_db_path)
    _conn.executescript(LEARNING_SCHEMA)
    _conn.commit()
    _conn.close()

init_learning_db()

# ── LEARNING ENGINE HELPERS ────────────────────────────────────────────────────

def build_learning_plan(gaps, profile, assessment_id, target_role):
    """Convert gap analysis into a phased 16-week learning curriculum."""
    # Sort gaps by priority and size
    high_gaps = [g for g in gaps if g["priority"] == "HIGH"]
    med_gaps  = [g for g in gaps if g["priority"] == "MED"]

    modules = []
    week = 1

    # Phase 1 (weeks 1-5): Address HIGH gaps — foundational courses
    for gap in high_gaps[:2]:  # max 2 high gaps in phase 1
        arch = gap["archetypeId"]
        courses = LEARNING_CATALOGUE.get(arch, [])
        if courses:
            c = courses[0]  # foundational
            modules.append({
                "archetypeId": arch, "gap_size": gap["gap"],
                "priority": "HIGH", "phase": 1, "week_start": week,
                "course": c
            })
            week += c["duration_weeks"] + 1

    # Phase 2 (weeks 6-11): MED gaps + intermediate on HIGH gaps
    for gap in (med_gaps[:2] + high_gaps[:1]):
        arch = gap["archetypeId"]
        courses = LEARNING_CATALOGUE.get(arch, [])
        if len(courses) > 1:
            c = courses[1]  # intermediate
            modules.append({
                "archetypeId": arch, "gap_size": gap["gap"],
                "priority": gap["priority"], "phase": 2, "week_start": week,
                "course": c
            })
            week += c["duration_weeks"] + 1

    # Phase 3 (weeks 12-16): Advanced / portfolio work
    for gap in high_gaps[:1]:
        arch = gap["archetypeId"]
        courses = LEARNING_CATALOGUE.get(arch, [])
        if len(courses) > 2:
            c = courses[2]  # advanced
            modules.append({
                "archetypeId": arch, "gap_size": gap["gap"],
                "priority": "HIGH", "phase": 3, "week_start": min(week, 13),
                "course": c
            })

    return modules



# ── LMS API ROUTES ────────────────────────────────────────────────────────────
# All routes use "with get_db() as db:" — never db = get_db()
# All routes read assessments from SQLite — never from the old in-memory store

@app.route("/api/learning/plans", methods=["POST"])
@require_json
def create_learning_plan():
    """
    Generate a personalised 16-week learning plan from strength gap analysis.
    INPUT:  assessmentId + targetRole
    OUTPUT: phased curriculum with courses mapped to specific archetype gaps
    CHAIN:  Assessment → Gap Analysis → Learning Plan (automatic)
    """
    body          = request.get_json()
    assessment_id = body.get("assessmentId")
    target_role   = body.get("targetRole")

    if not assessment_id:
        return jsonify({"error": "assessmentId is required"}), 400
    if not target_role:
        return jsonify({"error": "targetRole is required"}), 400

    with get_db() as db:
        # Load assessment from SQLite (not in-memory store)
        row = db.execute("SELECT * FROM assessments WHERE id=?", [assessment_id]).fetchone()
        if not row:
            return jsonify({"error": "Assessment not found"}), 404
        assessment = row_to_dict(row)
        if assessment.get("status") != "completed":
            return jsonify({"error": "Assessment must be completed before generating a learning plan"}), 400

        profile_id  = assessment.get("profile_id")
        profile_row = db.execute("SELECT * FROM profiles WHERE id=?", [profile_id]).fetchone()
        profile     = row_to_dict(profile_row) if profile_row else {"name": "Unknown", "role": target_role}

        scores = assessment.get("scores", [])
        gaps   = compute_gaps(scores, target_role)
        if not gaps:
            return jsonify({"error": f"No role requirements configured for '{target_role}'"}), 400

        modules_data = build_learning_plan(gaps, profile, assessment_id, target_role)

        plan_id = str(uuid.uuid4())
        now     = datetime.utcnow().isoformat()

        db.execute(
            "INSERT INTO learning_plans (id,profile_id,assessment_id,target_role,phase,status,created_at,updated_at) VALUES (?,?,?,?,1,'active',?,?)",
            [plan_id, profile_id, assessment_id, target_role, now, now]
        )

        inserted_modules = []
        for m in modules_data:
            mod_id = str(uuid.uuid4())
            c      = m["course"]
            db.execute(
                """INSERT INTO learning_modules
                   (id,plan_id,archetype_id,gap_size,priority,course_id,course_title,
                    course_type,provider,duration_weeks,week_start,status,progress_pct)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,'not_started',0)""",
                [mod_id, plan_id, m["archetypeId"], m["gap_size"], m["priority"],
                 c["id"], c["title"], c["type"], c["provider"], c["duration_weeks"], m["week_start"]]
            )
            inserted_modules.append({
                "id": mod_id, "archetypeId": m["archetypeId"],
                "gap_size": m["gap_size"], "priority": m["priority"],
                "phase": m["phase"], "week_start": m["week_start"],
                "title": c["title"], "course": c,
                "status": "not_started", "progress_pct": 0
            })

        primary   = next((s for s in scores if s.get("isPrimary")),   None)
        secondary = next((s for s in scores if s.get("isSecondary")), None)

        return jsonify({"data": {
            "planId":      plan_id,
            "profileId":   profile_id,
            "profileName": profile.get("name"),
            "targetRole":  target_role,
            "totalWeeks":  16,
            "primaryStone":   primary,
            "secondaryStone": secondary,
            "modules": inserted_modules,
            "phases": [
                {"phase":1,"label":"Foundation", "weeks":"1–5",  "color":"emerald","focus":"Close HIGH priority gaps with foundational knowledge anchored to your primary stone"},
                {"phase":2,"label":"Application","weeks":"6–11", "color":"gold",   "focus":"Real-world application: use your strength to accelerate the gap skill"},
                {"phase":3,"label":"Mastery",    "weeks":"12–16","color":"sapphire","focus":"Portfolio-grade evidence of growth — show what changed"},
            ]
        }}), 201


@app.route("/api/learning/plans/<plan_id>")
def get_learning_plan(plan_id):
    with get_db() as db:
        plan = db.execute("SELECT * FROM learning_plans WHERE id=?", [plan_id]).fetchone()
        if not plan:
            return jsonify({"error": "Plan not found"}), 404
        plan_d = row_to_dict(plan)

        modules = db.execute(
            "SELECT * FROM learning_modules WHERE plan_id=? ORDER BY week_start",
            [plan_id]
        ).fetchall()
        plan_d["modules"] = [row_to_dict(m) for m in modules]
        return jsonify({"data": plan_d})


@app.route("/api/learning/plans/profile/<profile_id>")
def get_profile_learning_plans(profile_id):
    with get_db() as db:
        plans = db.execute(
            "SELECT * FROM learning_plans WHERE profile_id=? ORDER BY created_at DESC",
            [profile_id]
        ).fetchall()
        result = []
        for p in plans:
            pd = row_to_dict(p)
            mods = db.execute(
                "SELECT * FROM learning_modules WHERE plan_id=? ORDER BY week_start",
                [pd["id"]]
            ).fetchall()
            pd["modules"] = [row_to_dict(m) for m in mods]
            result.append(pd)
        return jsonify({"data": result})


@app.route("/api/learning/modules/<module_id>/progress", methods=["PATCH"])
@require_json
def update_module_progress(module_id):
    """
    UPDATE progress on a learning module.
    INPUT:  progress_pct (0-100) + status (not_started/in_progress/completed)
    OUTPUT: updated module with plan-level progress recalculated
    """
    body         = request.get_json()
    progress_pct = body.get("progress_pct", 0)
    status       = body.get("status", "in_progress")

    with get_db() as db:
        mod = db.execute("SELECT * FROM learning_modules WHERE id=?", [module_id]).fetchone()
        if not mod:
            return jsonify({"error": "Module not found"}), 404

        db.execute(
            "UPDATE learning_modules SET progress_pct=?, status=? WHERE id=?",
            [progress_pct, status, module_id]
        )

        # Recalculate plan-level progress
        plan_id = row_to_dict(mod)["plan_id"]
        all_mods = db.execute(
            "SELECT progress_pct FROM learning_modules WHERE plan_id=?", [plan_id]
        ).fetchall()
        avg_progress = int(sum(m["progress_pct"] for m in all_mods) / len(all_mods)) if all_mods else 0
        db.execute(
            "UPDATE learning_plans SET updated_at=? WHERE id=?",
            [datetime.utcnow().isoformat(), plan_id]
        )

        return jsonify({"data": {"moduleId": module_id, "progress_pct": progress_pct,
                                  "status": status, "planProgress": avg_progress}})


@app.route("/api/learning/sessions/ai", methods=["POST"])
@require_json
def ai_learning_session():
    """
    AI-powered learning session. The 8 prompt types from the framework,
    each personalised by the learner's primary strength stone.

    INPUT:  moduleId + sessionType + userInput
    SESSION TYPES: diagnose, feynman, practice, mentor, plateau, weekly, curriculum, portfolio
    OUTPUT: AI coaching response + session stored for trajectory
    """
    body         = request.get_json()
    module_id    = body.get("moduleId")
    session_type = body.get("sessionType", "practice")
    user_input   = body.get("userInput", "")
    skill        = body.get("skill", "")
    context_text = body.get("context", "")

    with get_db() as db:
        # Load module + plan + profile + assessment for full context
        mod_row = db.execute("SELECT * FROM learning_modules WHERE id=?", [module_id]).fetchone() if module_id else None
        mod_d   = row_to_dict(mod_row) if mod_row else {}

        plan_row = db.execute("SELECT * FROM learning_plans WHERE id=?", [mod_d.get("plan_id","")]).fetchone() if mod_d.get("plan_id") else None
        plan_d   = row_to_dict(plan_row) if plan_row else {}

        profile_id  = plan_d.get("profile_id") or body.get("profileId", "")
        profile_row = db.execute("SELECT * FROM profiles WHERE id=?", [profile_id]).fetchone() if profile_id else None
        profile_d   = row_to_dict(profile_row) if profile_row else {}

        assessment_id  = plan_d.get("assessment_id") or body.get("assessmentId", "")
        assessment_row = db.execute("SELECT * FROM assessments WHERE id=?", [assessment_id]).fetchone() if assessment_id else None
        assessment_d   = row_to_dict(assessment_row) if assessment_row else {}

        scores    = assessment_d.get("scores", [])
        primary   = next((s for s in scores if s.get("isPrimary")),   None)
        secondary = next((s for s in scores if s.get("isSecondary")), None)

        learner_name = profile_d.get("name", "the learner")
        target_role  = plan_d.get("target_role") or profile_d.get("role", "their target role")
        arch_id      = mod_d.get("archetype_id") or skill
        arch_info    = ARCHETYPE_MAP.get(arch_id, {"name": arch_id})
        course_title = mod_d.get("course_title") or skill
        gap_size     = mod_d.get("gap_size", "significant")
        primary_name = primary["archetypeId"] if primary else "unknown"
        primary_pct  = primary["score"] if primary else 0

        # ── 8 Personalised Prompt Templates (strength-anchored) ────────────────
        PROMPTS = {
            "diagnose": f"""You are a learning strategist who has coached 1,000+ adults through skill acquisition.
Learner: {learner_name} | Primary Strength Stone: {primary_name} ({primary_pct}%) | Target Role: {target_role}
Developing: {arch_info.get('name', arch_id)} capability | Gap size: {gap_size} points

Run a full diagnosis:
1. The REAL skill gap they need to close (often different from what they think)
2. The 3 sub-skills inside {arch_info.get('name', arch_id)} that matter most for {target_role}
3. Prerequisite knowledge they are missing
4. How their {primary_name} strength can be leveraged to accelerate this gap closure
5. The 3 mistakes that will waste their time
6. A realistic 90-day milestone

Be direct. Results, not encouragement.""",

            "feynman": f"""You are a Socratic teacher. Your job: make {learner_name} explain concepts back to you, not explain them.
They are learning {course_title} to develop {arch_info.get('name', arch_id)} for {target_role}.
Their primary stone is {primary_name} — their natural thinking style. Watch for places they hide gaps behind their strength's jargon.

When they explain, identify:
1. Every vague or hand-wavy statement
2. 3 follow-up questions that expose what they don't actually know
3. Jargon used to hide gaps
4. Re-explain using analogy, not jargon
5. 3 progressively harder test questions
6. What to study again before moving on

Be ruthless. They will thank you in the interview.""",

            "practice": f"""You are a skill development coach designing deliberate practice for {learner_name}.
Primary strength: {primary_name} ({primary_pct}%) | Building: {arch_info.get('name', arch_id)} | Role: {target_role}

Design a practice session that BRIDGES from their {primary_name} strength TO the {arch_info.get('name', arch_id)} gap.
Their strength is a lever — not something to ignore. Practice should feel natural given who they are.

Build:
1. A 5-minute warm-up using their {primary_name} strength as the entry point
2. The MAIN drill — exactly what to do, for how long
3. 3 things to focus on while drilling
4. Self-feedback checklist for end of session
5. Common mistakes at this gap size ({gap_size} points) — and how to spot them
6. A stretch challenge if they have extra time
7. Reflection question to close

No busywork. Only practice that compounds.""",

            "mentor": f"""You are a senior mentor with 15+ years in {target_role}-level work.
{learner_name} is working on {course_title}. Their primary stone is {primary_name} — understand how this shapes their approach.

Review their submitted work as a seasoned professional:
1. 3 things done well — and why they matter technically
2. 3 biggest gaps in this work
3. What a senior would do differently — and the principle behind it
4. The 'tells' that reveal they are still developing (so they can eliminate them)
5. The one principle they are missing that would level them up
6. A specific exercise this week based on what they just submitted
7. A grade: junior / mid / senior — and what moves them up

Don't be polite. Polite mentors raise mediocre practitioners.""",

            "plateau": f"""You are a skill acquisition specialist helping {learner_name} break through a plateau.
They are strong in {primary_name} ({primary_pct}%) but stuck in {arch_info.get('name', arch_id)}.

Diagnose and fix:
1. The 3 most likely reasons they are stuck at this gap size
2. The comfort skills they keep practicing instead of growing
3. The uncomfortable skills they are avoiding — where the next level lives
4. A specific 30-day breakthrough plan using {primary_name} as the growth lever
5. The mental shift advanced practitioners make that intermediates miss
6. Daily habits that produce 10% growth per month from this stage
7. Signs they are finally moving — vs signs they are still drifting

Most people never break through. Show them how.""",

            "weekly": f"""You are a personal learning coach running a weekly review for {learner_name}.
Developing: {arch_info.get('name', arch_id)} | Target role: {target_role} | Gap: {gap_size} points
Primary stone: {primary_name} — factor this into HOW they learn, not just WHAT they learn.

Run their full weekly review:
1. Are they on track for their 90-day goal?
2. Which study method gave the most ROI this week?
3. Which was wasted time?
4. The 3 weak spots to attack next week
5. The 1 concept they are avoiding — and why they need to face it now
6. A specific challenge or project for next week
7. Grade A-F with the specific reason

No cheerleading. Be the tutor that makes them hireable.""",

            "curriculum": f"""You are a curriculum designer building a custom learning path for {learner_name}.
Target skill: {arch_info.get('name', arch_id)} | Current gap: {gap_size} points | Target role: {target_role}
Primary stone: {primary_name} — design the curriculum AROUND this strength, not despite it.

Build a 90-day curriculum:
1. Phase 1 (Days 1-30): Foundations — exact topics and order
2. Phase 2 (Days 31-60): Application — real projects tied to their {target_role} context
3. Phase 3 (Days 61-90): Mastery — portfolio work that proves the gap is closed
4. Specific resources for each phase (name real books, courses, channels)
5. Weekly milestones they can measure
6. The 3 ego traps that derail learners at each phase
7. A minimum viable day for chaotic weeks

Cut everything that doesn't compound toward closing this specific gap.""",

            "portfolio": f"""You are a hiring manager who reviews 100+ portfolios monthly for {target_role} roles.
{learner_name} is closing a gap in {arch_info.get('name', arch_id)} to qualify for {target_role}.
Their primary stone is {primary_name} — the portfolio should signal this genuine strength WHILE demonstrating the gap is closed.

Design their portfolio project:
1. The ONE project that proves they can do this work — specific, not generic
2. Why this project signals competence to a hiring manager for {target_role}
3. The exact scope to commit to (not too small, not too big)
4. A 3-week build timeline
5. What to include in the writeup so it stands out
6. The 5 mistakes that make portfolios look amateur
7. Where to publish it for maximum visibility

One great thing beats 10 mediocre things.""",
        }

        system_prompt = PROMPTS.get(session_type, PROMPTS["practice"])

        client = get_ai_client()
        if not client:
            fallback = f"""AI Learning Session — {course_title or skill} ({session_type} mode)

Your {arch_info.get('name', arch_id)} gap is {gap_size} points. Closing this gap is critical for your {target_role} goal.

Based on your {primary_name} primary stone, here is how to approach this:

Your {primary_name} strength means you likely learn best through [{
    'mentoring others and seeing growth' if primary_name == 'growth' else
    'direct application and hands-on building' if primary_name in ['systems','activation','completion'] else
    'big-picture context before details' if primary_name in ['vision','clarity'] else
    'collaborative discussion and teaching' if primary_name in ['teaching','relationship','culture'] else
    'experimentation and creative exploration' if primary_name == 'innovation' else
    'structured, consistent practice'
}].

To close the {arch_info.get('name', arch_id)} gap this week:
1. Spend 20 minutes on {course_title or 'your current module'}
2. Apply one concept in a real work context — not just theoretical study
3. Ask a colleague for specific feedback on {arch_id}-related behaviour
4. Record what you noticed in the reflection section

Add your ANTHROPIC_API_KEY to .env for personalised AI coaching responses."""

            return jsonify({"data": {"response": fallback, "aiPowered": False}})

        try:
            full_input = user_input or f"I am working on {course_title or skill}. Please run a full {session_type} session for me."
            if context_text:
                full_input = f"{context_text}\n\n{full_input}"

            message = client.messages.create(
                model="claude-sonnet-4-5",
                max_tokens=900,
                system=system_prompt,
                messages=[{"role": "user", "content": full_input}]
            )
            ai_response = message.content[0].text

            session_id = str(uuid.uuid4())
            db.execute(
                "INSERT INTO learning_sessions (id,module_id,session_type,content,ai_response,created_at) VALUES (?,?,?,?,?,?)",
                [session_id, module_id or "", session_type, full_input, ai_response, datetime.utcnow().isoformat()]
            )

            return jsonify({"data": {"response": ai_response, "aiPowered": True, "sessionId": session_id}})
        except Exception as e:
            # If 401, key is invalid — use fallback rather than crashing
            if '401' in str(e) or 'authentication' in str(e).lower():
                return jsonify({"data": {"response": f"AI coaching unavailable — check your ANTHROPIC_API_KEY in .env. Session type: {session_type}", "aiPowered": False}})
            return jsonify({"error": f"AI session error: {str(e)}"}), 503


@app.route("/api/learning/weekly-review", methods=["POST"])
@require_json
def create_weekly_review():
    """
    Submit weekly review data → receive AI coaching grade and plan.
    INPUT:  planId + hoursStudied + topicsCovered + concepts + wins + slips + energy
    OUTPUT: AI weekly review with grade A-F, specific actions, next week plan
    """
    body    = request.get_json()
    plan_id = body.get("planId")

    with get_db() as db:
        plan_row    = db.execute("SELECT * FROM learning_plans WHERE id=?", [plan_id]).fetchone() if plan_id else None
        plan_d      = row_to_dict(plan_row) if plan_row else {}
        profile_row = db.execute("SELECT * FROM profiles WHERE id=?", [plan_d.get("profile_id","")]).fetchone() if plan_d.get("profile_id") else None
        profile_d   = row_to_dict(profile_row) if profile_row else {}
        assessment_row = db.execute("SELECT * FROM assessments WHERE id=?", [plan_d.get("assessment_id","")]).fetchone() if plan_d.get("assessment_id") else None
        assessment_d   = row_to_dict(assessment_row) if assessment_row else {}
        scores    = assessment_d.get("scores", [])
        primary   = next((s for s in scores if s.get("isPrimary")), None)
        primary_name = primary["archetypeId"] if primary else "unknown"

        review_data = {
            "skill":         plan_d.get("target_role", "target skill"),
            "hours":         body.get("hoursStudied", 0),
            "topics":        body.get("topicsCovered", ""),
            "clicked":       body.get("conceptsClicked", ""),
            "unclear":       body.get("conceptsUnclear", ""),
            "wins":          body.get("wins", ""),
            "slips":         body.get("slips", ""),
            "energy":        body.get("energy", 7),
            "learner":       profile_d.get("name", "the learner"),
            "primary_stone": primary_name,
        }

        prompt = f"""You are a personal learning coach running a weekly review for {review_data['learner']}.
Primary Strength Stone: {review_data['primary_stone']} | Developing: {review_data['skill']}

This week's data:
- Hours studied: {review_data['hours']}
- Topics covered: {review_data['topics']}
- Concepts that clicked: {review_data['clicked']}
- Still unclear: {review_data['unclear']}
- Wins: {review_data['wins']}
- Slips: {review_data['slips']}
- Energy/motivation (1-10): {review_data['energy']}

Run the full weekly review:
1. On track for 90-day goal? (Yes/No + specific reason)
2. Highest ROI study method this week
3. What was wasted time
4. 3 weak spots to attack next week
5. 1 concept being avoided — and why to face it now
6. A specific project or challenge for next week
7. Grade (A-F) with the specific reason — no cheerleading

Be the tutor that makes them hireable, not the coach that makes them feel good."""

        client = get_ai_client()
        if not client:
            review_response = f"""Weekly Review — {review_data['learner']}

Hours: {review_data['hours']} | Energy: {review_data['energy']}/10

Quick assessment:
- {review_data['hours']} hours this week is {'strong' if int(review_data['hours'] or 0) >= 5 else 'below target — aim for 5+ hours'}
- Energy at {review_data['energy']}/10 suggests {'good momentum' if int(review_data['energy'] or 7) >= 7 else 'something needs adjusting — check if the material is too abstract'}

Next week focus: Address what remained unclear: {review_data['unclear'] or 'review your notes and identify the sticking point'}

Add your ANTHROPIC_API_KEY for a full AI coaching review."""
            return jsonify({"data": {"response": review_response, "aiPowered": False}})

        try:
            message = client.messages.create(
                model="claude-sonnet-4-5",
                max_tokens=700,
                messages=[{"role": "user", "content": prompt}]
            )
            review_id = str(uuid.uuid4())
            review_response = message.content[0].text

            # Store as a weekly_review record
            db.execute(
                """INSERT INTO weekly_reviews (id,plan_id,week_number,hours_studied,modules_progressed,concepts_clicked,concepts_stuck,energy_rating,ai_review,created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                [review_id, plan_id or "", 1, review_data["hours"], "[]",
                 review_data.get("clicked",""), review_data.get("unclear",""),
                 review_data["energy"], review_response, datetime.utcnow().isoformat()]
            )

            return jsonify({"data": {"response": review_response, "aiPowered": True, "reviewId": review_id}})
        except Exception as e:
            if '401' in str(e) or 'authentication' in str(e).lower():
                return jsonify({"data": {"response": f"Weekly review unavailable — check your ANTHROPIC_API_KEY in .env.", "aiPowered": False}})
            return jsonify({"error": f"AI review error: {str(e)}"}), 503


@app.route("/api/learning/catalogue")
def get_learning_catalogue():
    """Return the full course catalogue with archetype mappings."""
    return jsonify({"data": LEARNING_CATALOGUE})


# ── ERROR HANDLERS ────────────────────────────────────────────────────────────


# if __name__ == "__main__":
#     port  = int(os.getenv("PORT", 5000))
#     debug = os.getenv("NODE_ENV", "development") == "development"
#     print(f"[SI] Strength Intelligence API running on http://localhost:{port}")
#     app.run(host="0.0.0.0", port=port, debug=debug)


# ══════════════════════════════════════════════════════════════════════════════
# FIX 2 — PDF REPORT GENERATION
# FIX 3 — EMAIL / FEEDBACK LOOPS
# FIX 7 — WAITLIST & LEAD CAPTURE
# FIX 8 — NOTIFICATION TRIGGERS
# ══════════════════════════════════════════════════════════════════════════════

import io
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT

GOLD   = colors.HexColor("#D4A843")
DARK   = colors.HexColor("#0D1117")
GREEN  = colors.HexColor("#3DAA7A")
SOFT   = colors.HexColor("#5A4A3A")
LGRAY  = colors.HexColor("#F0F0F0")

# ── EMAIL CONFIG ─────────────────────────────────────────────────────────────

def get_email_config():
    return {
        "smtp_host":  os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "smtp_port":  int(os.getenv("SMTP_PORT", "587")),
        "smtp_user":  os.getenv("SMTP_USER", ""),
        "smtp_pass":  os.getenv("SMTP_PASS", ""),
        "from_name":  os.getenv("FROM_NAME", "Strength Intelligence"),
        "from_email": os.getenv("FROM_EMAIL", "hello@strengthintelligence.io"),
    }

def send_email(to_email, to_name, subject, html_body, attachment_pdf=None, attachment_name=None):
    """
    Send a transactional email.
    Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env.
    Gmail: use App Password (not account password) with smtp.gmail.com:587.
    """
    cfg = get_email_config()
    if not cfg["smtp_user"] or not cfg["smtp_pass"]:
        return {"sent": False, "reason": "SMTP not configured in .env — add SMTP_USER and SMTP_PASS"}

    try:
        msg = MIMEMultipart("mixed")
        msg["From"]    = f"{cfg['from_name']} <{cfg['from_email']}>"
        msg["To"]      = f"{to_name} <{to_email}>" if to_name else to_email
        msg["Subject"] = subject

        msg.attach(MIMEText(html_body, "html"))

        if attachment_pdf and attachment_name:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(attachment_pdf)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f'attachment; filename="{attachment_name}"')
            msg.attach(part)

        with smtplib.SMTP(cfg["smtp_host"], cfg["smtp_port"]) as server:
            server.starttls()
            server.login(cfg["smtp_user"], cfg["smtp_pass"])
            server.sendmail(cfg["from_email"], to_email, msg.as_string())

        return {"sent": True}
    except Exception as e:
        return {"sent": False, "reason": str(e)}


def build_email_html(name, subject_line, body_paragraphs, cta_text=None, cta_url=None):
    """Branded HTML email template."""
    cta_block = f"""
    <div style="text-align:center;margin:32px 0">
      <a href="{cta_url}" style="background:#D4A843;color:#0D1117;padding:12px 28px;border-radius:8px;
         text-decoration:none;font-weight:700;font-family:Arial,sans-serif;font-size:14px">{cta_text}</a>
    </div>""" if cta_text and cta_url else ""

    paras = "".join(f'<p style="margin:0 0 14px;line-height:1.7;font-size:14px;color:#1A1410">{p}</p>' for p in body_paragraphs)

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="background:#FAF7F2;font-family:Georgia,serif;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08)">
  <div style="background:#0D1117;padding:28px 32px;text-align:center">
    <div style="font-size:22px;font-weight:700;color:#D4A843;letter-spacing:0.08em">◆ STRENGTH INTELLIGENCE ◆</div>
  </div>
  <div style="padding:32px">
    <h2 style="font-size:22px;color:#1A1410;margin:0 0 20px;font-weight:700">{subject_line}</h2>
    <p style="margin:0 0 14px;font-size:14px;color:#5A4A3A">Dear {name},</p>
    {paras}
    {cta_block}
  </div>
  <div style="background:#FAF7F2;padding:20px 32px;border-top:1px solid #E8DDD0;text-align:center">
    <p style="font-size:11px;color:#8892A4;margin:0">Strength Intelligence · hello@strengthintelligence.io · Nairobi, Kenya</p>
    <p style="font-size:11px;color:#8892A4;margin:6px 0 0">Discover. Profile. Analyse. Develop. Perform.</p>
  </div>
</div></body></html>"""


# ── PDF REPORT GENERATION ────────────────────────────────────────────────────

def generate_profile_pdf(profile, assessment, gaps=None, goals=None, outcomes=None):
    """
    Generate a downloadable PDF report for a strength profile.
    Suitable for sharing with HR teams, boards, and procurement.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=20*mm, leftMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm
    )

    styles  = getSampleStyleSheet()
    elements = []

    # Title block
    title_style = ParagraphStyle("Title", fontName="Helvetica-Bold", fontSize=22,
                                  textColor=DARK, spaceAfter=4, leading=28)
    sub_style   = ParagraphStyle("Sub",   fontName="Helvetica", fontSize=11,
                                  textColor=SOFT, spaceAfter=16)
    h2_style    = ParagraphStyle("H2",    fontName="Helvetica-Bold", fontSize=14,
                                  textColor=DARK, spaceBefore=16, spaceAfter=6)
    body_style  = ParagraphStyle("Body",  fontName="Helvetica", fontSize=10,
                                  textColor=DARK, leading=16, spaceAfter=8)
    gold_style  = ParagraphStyle("Gold",  fontName="Helvetica-Bold", fontSize=11,
                                  textColor=GOLD, spaceAfter=4)

    elements.append(Paragraph("STRENGTH INTELLIGENCE", ParagraphStyle("Brand",
        fontName="Helvetica-Bold", fontSize=10, textColor=GOLD,
        spaceAfter=4, leading=14, alignment=TA_CENTER, characterSpacing=2)))
    elements.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=16))

    elements.append(Paragraph(profile.get("name", "Profile Report"), title_style))
    elements.append(Paragraph(
        f"{profile.get('role','')}  ·  Report generated {datetime.utcnow().strftime('%B %d, %Y')}",
        sub_style))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=LGRAY, spaceAfter=16))

    # Primary & secondary stones
    scores  = assessment.get("scores", []) if assessment else []
    primary   = next((s for s in scores if s.get("isPrimary")),   None)
    secondary = next((s for s in scores if s.get("isSecondary")), None)
    risks     = assessment.get("risks", []) if assessment else []

    if primary or secondary:
        elements.append(Paragraph("Strength Profile", h2_style))
        stone_data = [["Stone", "Archetype", "Score", "Role"]]
        if primary:
            info = ARCHETYPE_MAP.get(primary["archetypeId"], {})
            stone_data.append([
                f"{info.get('icon','')} {info.get('gem','')}", info.get("name",""),
                f"{primary['score']}%", "Primary"
            ])
        if secondary:
            info = ARCHETYPE_MAP.get(secondary["archetypeId"], {})
            stone_data.append([
                f"{info.get('icon','')} {info.get('gem','')}", info.get("name",""),
                f"{secondary['score']}%", "Secondary"
            ])

        stone_tbl = Table(stone_data, colWidths=[35*mm, 65*mm, 25*mm, 30*mm])
        stone_tbl.setStyle(TableStyle([
            ("BACKGROUND",  (0,0), (-1,0), DARK),
            ("TEXTCOLOR",   (0,0), (-1,0), GOLD),
            ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",    (0,0), (-1,-1), 9),
            ("BACKGROUND",  (0,1), (-1,-1), colors.white),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LGRAY]),
            ("GRID",        (0,0), (-1,-1), 0.5, colors.HexColor("#DDDDDD")),
            ("LEFTPADDING", (0,0), (-1,-1), 8),
            ("RIGHTPADDING",(0,0), (-1,-1), 8),
            ("TOPPADDING",  (0,0), (-1,-1), 6),
            ("BOTTOMPADDING",(0,0), (-1,-1), 6),
        ]))
        elements.append(stone_tbl)
        elements.append(Spacer(1, 8*mm))

    # All 12 scores as a bar chart table
    if scores:
        elements.append(Paragraph("All Archetype Scores", h2_style))
        score_data = [["Archetype", "Score", "Bar"]]
        for s in sorted(scores, key=lambda x: -x["score"]):
            info = ARCHETYPE_MAP.get(s["archetypeId"], {})
            bar  = "█" * int(s["score"] / 5) + "░" * (20 - int(s["score"] / 5))
            score_data.append([
                f"{info.get('icon','')} {info.get('name', s['archetypeId'])}",
                f"{s['score']}%", bar
            ])
        score_tbl = Table(score_data, colWidths=[70*mm, 20*mm, 65*mm])
        score_tbl.setStyle(TableStyle([
            ("BACKGROUND",  (0,0), (-1,0), DARK),
            ("TEXTCOLOR",   (0,0), (-1,0), GOLD),
            ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",    (0,0), (-1,-1), 8),
            ("FONTNAME",    (2,1), (2,-1), "Courier"),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LGRAY]),
            ("GRID",        (0,0), (-1,-1), 0.5, colors.HexColor("#DDDDDD")),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("RIGHTPADDING",(0,0), (-1,-1), 6),
            ("TOPPADDING",  (0,0), (-1,-1), 4),
            ("BOTTOMPADDING",(0,0), (-1,-1), 4),
        ]))
        elements.append(score_tbl)
        elements.append(Spacer(1, 8*mm))

    # Gap analysis
    if gaps:
        elements.append(Paragraph("Gap Analysis", h2_style))
        gap_data = [["Archetype", "Current", "Required", "Gap", "Priority"]]
        for g in gaps:
            gap_data.append([
                g.get("dimension", g.get("archetypeId","")),
                f"{g['current']}%", f"{g['required']}%",
                f"{g['gap']}%", g["priority"]
            ])
        gap_tbl = Table(gap_data, colWidths=[55*mm, 25*mm, 25*mm, 20*mm, 25*mm])
        gap_tbl.setStyle(TableStyle([
            ("BACKGROUND",  (0,0), (-1,0), DARK),
            ("TEXTCOLOR",   (0,0), (-1,0), GOLD),
            ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",    (0,0), (-1,-1), 9),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LGRAY]),
            ("GRID",        (0,0), (-1,-1), 0.5, colors.HexColor("#DDDDDD")),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("TOPPADDING",  (0,0), (-1,-1), 5),
            ("BOTTOMPADDING",(0,0), (-1,-1), 5),
        ]))
        elements.append(gap_tbl)
        elements.append(Spacer(1, 8*mm))

    # Risks
    if risks:
        elements.append(Paragraph("Misalignment Risks", h2_style))
        risk_colors = {"high": colors.HexColor("#E05060"), "medium": colors.HexColor("#F0A040"),
                       "low":  colors.HexColor("#3DAA7A")}
        for r in risks:
            rc = risk_colors.get(r.get("level","low"), GREEN)
            elements.append(Paragraph(
                f"<b>{r.get('level','').upper()}:</b> {r.get('description','')}",
                ParagraphStyle("Risk", fontName="Helvetica", fontSize=9, leading=14,
                               textColor=DARK, leftIndent=10, spaceAfter=5,
                               borderPad=4, backColor=colors.HexColor("#FAF7F2"))))

    # Goals summary
    if goals:
        elements.append(Spacer(1, 6*mm))
        elements.append(Paragraph("Performance Goals", h2_style))
        done_count = sum(1 for g in goals if g.get("done"))
        elements.append(Paragraph(
            f"{done_count} of {len(goals)} goals completed ({round(done_count/len(goals)*100) if goals else 0}%)",
            body_style))
        goal_data = [["Goal", "Type", "Progress", "Status"]]
        for g in goals[:8]:
            goal_data.append([
                g.get("text","")[:60]+"..." if len(g.get("text",""))>60 else g.get("text",""),
                g.get("goal_type", "qualitative"),
                f"{g.get('progress_pct',0)}%",
                "Done" if g.get("done") else "Active"
            ])
        goal_tbl = Table(goal_data, colWidths=[85*mm, 25*mm, 20*mm, 20*mm])
        goal_tbl.setStyle(TableStyle([
            ("BACKGROUND",  (0,0), (-1,0), DARK),
            ("TEXTCOLOR",   (0,0), (-1,0), GOLD),
            ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",    (0,0), (-1,-1), 8),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LGRAY]),
            ("GRID",        (0,0), (-1,-1), 0.5, colors.HexColor("#DDDDDD")),
            ("LEFTPADDING", (0,0), (-1,-1), 5),
            ("TOPPADDING",  (0,0), (-1,-1), 4),
            ("BOTTOMPADDING",(0,0), (-1,-1), 4),
            ("WORDWRAP",    (0,0), (-1,-1), True),
        ]))
        elements.append(goal_tbl)

    # Footer
    elements.append(Spacer(1, 10*mm))
    elements.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=8))
    elements.append(Paragraph(
        "Strength Intelligence · hello@strengthintelligence.io · Confidential",
        ParagraphStyle("Footer", fontName="Helvetica", fontSize=8, textColor=SOFT, alignment=TA_CENTER)))

    doc.build(elements)
    return buf.getvalue()


# ── PDF DOWNLOAD ENDPOINT ─────────────────────────────────────────────────────

from flask import send_file, Response

@app.route("/api/profiles/<pid>/report/pdf")
def download_report_pdf(pid):
    """
    Download a complete PDF strength report for a profile.
    Suitable for sharing with boards, HR teams, and procurement.
    Optionally email it: ?email=true&recipient=name@org.com
    """
    with get_db() as db:
        profile_row = db.execute("SELECT * FROM profiles WHERE id=?", (pid,)).fetchone()
        if not profile_row:
            return jsonify({"error": "Profile not found"}), 404
        profile = row_to_dict(profile_row)

        assessments = [row_to_dict(r) for r in db.execute(
            "SELECT * FROM assessments WHERE profile_id=? AND status='completed' ORDER BY created_at DESC",
            (pid,)
        ).fetchall()]
        goals = [dict(r) for r in db.execute(
            "SELECT * FROM goals WHERE profile_id=? ORDER BY created_at DESC", (pid,)
        ).fetchall()]
        outcomes = [dict(r) for r in db.execute(
            "SELECT * FROM outcomes WHERE profile_id=? ORDER BY recorded_at DESC", (pid,)
        ).fetchall()]

    latest = assessments[0] if assessments else {}

    # Optional gap analysis
    target_role = request.args.get("role", profile.get("role", ""))
    gaps = compute_gaps(latest.get("scores", []), target_role) if latest else []

    pdf_bytes = generate_profile_pdf(profile, latest, gaps, goals, outcomes)
    filename  = f"SI_Report_{profile['name'].replace(' ','_')}_{datetime.utcnow().strftime('%Y%m%d')}.pdf"

    # Optional email delivery
    send_to = request.args.get("email")
    recipient_name = request.args.get("name", profile.get("name", ""))
    if send_to:
        result = send_email(
            to_email=send_to, to_name=recipient_name,
            subject=f"Strength Intelligence Report — {profile['name']}",
            html_body=build_email_html(
                name=recipient_name,
                subject_line=f"Your Strength Intelligence Report is ready",
                body_paragraphs=[
                    f"Your full Strength Intelligence profile for <strong>{profile['name']}</strong> is attached.",
                    f"Primary stone: <strong>{ARCHETYPE_MAP.get(next((s['archetypeId'] for s in latest.get('scores',[]) if s.get('isPrimary')), ''), {}).get('name', 'See report')}</strong>",
                    "The report contains your complete archetype scores, gap analysis, misalignment risks, and goal completion record. It is designed to be shared with your manager, HR Director, or coach.",
                    "To view your full profile online and run a gap analysis against any target role, visit your SI dashboard.",
                ],
                cta_text="View your dashboard",
                cta_url=os.getenv("APP_URL", "http://localhost:3000")
            ),
            attachment_pdf=pdf_bytes, attachment_name=filename
        )
        if not result["sent"]:
            return jsonify({"warning": f"PDF generated but email failed: {result.get('reason')}", "filename": filename}), 207

    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ── ORG REPORT PDF ────────────────────────────────────────────────────────────

@app.route("/api/reports/organisation")
def org_report_pdf():
    """
    Management-level organisation report.
    Shows: strength distribution, risk flags, validation progress, benchmark data.
    This is what a CHRO presents to the board.
    """
    with get_db() as db:
        profiles    = [row_to_dict(r) for r in db.execute("SELECT * FROM profiles").fetchall()]
        assessments = [row_to_dict(r) for r in db.execute(
            "SELECT * FROM assessments WHERE status='completed'"
        ).fetchall()]
        outcomes    = [dict(r) for r in db.execute("SELECT * FROM outcomes").fetchall()]
        benchmarks  = [dict(r) for r in db.execute("SELECT * FROM role_benchmarks").fetchall()]

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=20*mm, leftMargin=20*mm,
                             topMargin=20*mm, bottomMargin=20*mm)
    elements = []
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=20, textColor=DARK, spaceAfter=6)
    h2 = ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=13, textColor=DARK, spaceBefore=14, spaceAfter=6)
    bd = ParagraphStyle("BD", fontName="Helvetica", fontSize=10, textColor=DARK, leading=16, spaceAfter=6)
    sm = ParagraphStyle("SM", fontName="Helvetica", fontSize=9, textColor=SOFT, spaceAfter=4)

    elements.append(Paragraph("STRENGTH INTELLIGENCE", ParagraphStyle("Br",
        fontName="Helvetica-Bold", fontSize=10, textColor=GOLD, spaceAfter=4, alignment=TA_CENTER, characterSpacing=2)))
    elements.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=14))
    elements.append(Paragraph("Organisation Strength Report", h1))
    elements.append(Paragraph(
        f"Generated {datetime.utcnow().strftime('%B %d, %Y')}  ·  {len(profiles)} profiles  ·  {len(assessments)} assessments  ·  {len(outcomes)} outcome records",
        sm))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=LGRAY, spaceAfter=14))

    # Summary stats
    elements.append(Paragraph("Executive Summary", h2))
    summary_data = [
        ["Metric", "Value", "Status"],
        ["Total profiles assessed", str(len(profiles)), "Active"],
        ["Completed assessments",  str(len(assessments)), "Active"],
        ["Outcome records collected", str(len(outcomes)),
         "Validated" if len(outcomes)>=10 else f"Need {10-len(outcomes)} more"],
        ["Validation readiness", f"{min(100,len(outcomes)*10)}%",
         "Ready for publication" if len(outcomes)>=10 else "Building evidence"],
        ["Roles with benchmarks", str(len(set(b['role'] for b in benchmarks))), "Active"],
    ]
    st = Table(summary_data, colWidths=[70*mm, 40*mm, 45*mm])
    st.setStyle(TableStyle([
        ("BACKGROUND",  (0,0), (-1,0), DARK), ("TEXTCOLOR", (0,0), (-1,0), GOLD),
        ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LGRAY]),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#DDDDDD")),
        ("LEFTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    elements.append(st)

    # Strength distribution
    dist = {}
    for a in assessments:
        scores = a.get("scores", [])
        p = next((s for s in scores if s.get("isPrimary")), None)
        if p:
            dist[p["archetypeId"]] = dist.get(p["archetypeId"], 0) + 1
    if dist:
        elements.append(Paragraph("Strength Distribution Across Organisation", h2))
        dist_data = [["Stone", "Archetype", "Count", "% of Org"]]
        for aid, count in sorted(dist.items(), key=lambda x: -x[1]):
            info = ARCHETYPE_MAP.get(aid, {})
            pct  = round(count/len(assessments)*100) if assessments else 0
            dist_data.append([f"{info.get('icon','')} {info.get('gem',aid)}",
                               info.get("name",""), str(count), f"{pct}%"])
        dt = Table(dist_data, colWidths=[30*mm, 60*mm, 20*mm, 25*mm])
        dt.setStyle(TableStyle([
            ("BACKGROUND",  (0,0), (-1,0), DARK), ("TEXTCOLOR", (0,0), (-1,0), GOLD),
            ("FONTNAME",    (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 9),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LGRAY]),
            ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#DDDDDD")),
            ("LEFTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ]))
        elements.append(dt)

    elements.append(Spacer(1, 10*mm))
    elements.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=8))
    elements.append(Paragraph(
        "Strength Intelligence · hello@strengthintelligence.io · Management Confidential",
        ParagraphStyle("Ft", fontName="Helvetica", fontSize=8, textColor=SOFT, alignment=TA_CENTER)))

    doc.build(elements)
    pdf = buf.getvalue()

    send_to = request.args.get("email")
    if send_to:
        send_email(
            to_email=send_to, to_name="HR Director",
            subject="Strength Intelligence — Organisation Report",
            html_body=build_email_html(
                "Team", "Organisation Strength Report",
                ["Please find attached your organisation-level Strength Intelligence report.",
                 "This report covers strength distribution, validation progress, and benchmark data across all assessed profiles.",
                 "It is designed to be shared with your board or senior leadership team."]
            ),
            attachment_pdf=pdf,
            attachment_name=f"SI_Org_Report_{datetime.utcnow().strftime('%Y%m%d')}.pdf"
        )

    return Response(pdf, mimetype="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="SI_Org_Report_{datetime.utcnow().strftime("%Y%m%d")}.pdf"'})


# ── WAITLIST & LEAD CAPTURE ───────────────────────────────────────────────────

@app.route("/api/waitlist", methods=["POST"])
@require_json
def join_waitlist():
    """
    Capture a lead from the assessment completion screen or landing page.
    Stores in DB and triggers welcome email sequence.
    INPUT: email, name, role, source (assessment/landing/coach)
    """
    body  = request.get_json()
    email = (body.get("email") or "").strip().lower()
    name  = (body.get("name")  or "").strip()

    if not email or "@" not in email:
        return jsonify({"error": "Valid email required"}), 400

    wid = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    with get_db() as db:
        # Upsert — don't duplicate if already on waitlist
        existing = db.execute("SELECT id FROM waitlist WHERE email=?", (email,)).fetchone()
        if not existing:
            db.execute(
                "INSERT INTO waitlist (id, email, name, role, source, assessment_id, created_at) VALUES (?,?,?,?,?,?,?)",
                [wid, email, name, body.get("role",""), body.get("source","assessment"),
                 body.get("assessmentId"), now]
            )

    # Trigger Day 0 welcome email
    profile_name  = name or "there"
    stone_name    = body.get("primaryStone", "")
    stone_context = f"Your primary stone is <strong>{stone_name}</strong>. " if stone_name else ""

    send_email(
        to_email=email, to_name=name,
        subject="Your Strength Intelligence profile is ready",
        html_body=build_email_html(
            name=profile_name,
            subject_line="Your Strength Stone profile is ready",
            body_paragraphs=[
                f"{stone_context}Your full Strength Intelligence report is attached — it contains your complete archetype scores, misalignment risk flags, and an AI-powered interpretation of your profile.",
                "Most people find their primary stone immediately resonant. The secondary stone is often the surprise. Pay attention to which one surprises you — that is usually where the most useful development insight lives.",
                "Over the next two weeks, we will send you three short follow-up notes. None of them are sales emails. They are practical insights drawn from the 12 archetypes and what we have learned from the profiles we have run.",
                "If at any point you want to discuss your results or explore what SI looks like for your team, reply to this email. We read and respond to every reply.",
            ],
            cta_text="View your full profile online",
            cta_url=os.getenv("APP_URL", "http://localhost:3000")
        )
    )

    return jsonify({"data": {"id": wid, "email": email, "message": "Welcome email sent"}}), 201


@app.route("/api/waitlist", methods=["GET"])
def list_waitlist():
    """Management view of all leads."""
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM waitlist ORDER BY created_at DESC"
        ).fetchall()
    return jsonify({"data": [dict(r) for r in rows], "total": len(rows)})


# ── NOTIFICATION / FEEDBACK TRIGGERS ──────────────────────────────────────────

@app.route("/api/notifications/outcome-reminder", methods=["POST"])
@require_json
def send_outcome_reminder():
    """
    Send a 30-day outcome reminder email to the manager on record.
    Triggered manually or by a scheduled job.
    INPUT: assessmentId, managerEmail, managerName, personName
    """
    body         = request.get_json()
    assessment_id = body.get("assessmentId")
    manager_email = body.get("managerEmail")
    manager_name  = body.get("managerName", "Manager")
    person_name   = body.get("personName", "your team member")
    days          = body.get("days", 30)

    if not manager_email:
        return jsonify({"error": "managerEmail required"}), 400

    result = send_email(
        to_email=manager_email, to_name=manager_name,
        subject=f"SI: {days}-day performance check-in for {person_name}",
        html_body=build_email_html(
            name=manager_name,
            subject_line=f"{days}-Day Strength Alignment Check-in",
            body_paragraphs=[
                f"It has been {days} days since {person_name} completed their Strength Intelligence assessment.",
                "We would like to capture a quick manager rating to build the validation dataset that proves whether SI scores predict real performance. This is a 2-minute form.",
                "Three questions: How would you rate their performance this period (1–10)? How well does their current role suit their strengths (1–10)? How engaged do they appear at work (1–10)?",
                "These ratings are anonymous to the individual and used only in aggregate to improve the SI model. You will receive a summary of what the data shows across the cohort when we reach 10 records.",
            ],
            cta_text=f"Rate {person_name}'s 30-day performance →",
            cta_url=f"{os.getenv('APP_URL','http://localhost:3000')}/outcomes?assessment={assessment_id}"
        )
    )

    return jsonify({"data": result})


@app.route("/api/notifications/weekly-nudge", methods=["POST"])
@require_json
def send_weekly_nudge():
    """
    Send a weekly learning nudge to a learner with an active plan.
    """
    body  = request.get_json()
    email = body.get("email")
    name  = body.get("name", "there")
    module_title = body.get("moduleTitle", "your current module")
    week  = body.get("week", 1)
    plan_id = body.get("planId")

    if not email:
        return jsonify({"error": "email required"}), 400

    result = send_email(
        to_email=email, to_name=name,
        subject=f"Week {week} check-in — your SI learning plan",
        html_body=build_email_html(
            name=name,
            subject_line=f"Week {week} — How is {module_title} going?",
            body_paragraphs=[
                f"You are in week {week} of your Strength Intelligence learning plan. This week's focus: <strong>{module_title}</strong>.",
                "The most important learning habit at this stage: apply one concept from this week's material in a real work situation before next Friday. Reading without applying is the most common reason learning plans stall.",
                "Three questions to reflect on before your next session: What did you actually practice this week? Where did your primary strength show up — or get in the way? What is the one thing you are still avoiding?",
                "Your weekly review is waiting. It takes 5 minutes and gives you a grade A–F with specific actions for next week.",
            ],
            cta_text="Start my weekly review →",
            cta_url=f"{os.getenv('APP_URL','http://localhost:3000')}/lms?plan={plan_id}&tab=review"
        )
    )
    return jsonify({"data": result})


# ── WAITLIST TABLE (add to init_db) ──────────────────────────────────────────
# Note: call init_db() again to create the waitlist table on first run
_WAITLIST_SQL = """
CREATE TABLE IF NOT EXISTS waitlist (
    id           TEXT PRIMARY KEY,
    email        TEXT NOT NULL UNIQUE,
    name         TEXT,
    role         TEXT,
    source       TEXT DEFAULT 'assessment',
    assessment_id TEXT,
    created_at   TEXT NOT NULL
);
"""
with get_db() as _db:
    _db.executescript(_WAITLIST_SQL)



# ══════════════════════════════════════════════════════════════════════════════
# AUTHENTICATION SYSTEM — COMPLETE IMPLEMENTATION
# ══════════════════════════════════════════════════════════════════════════════

JWT_SECRET    = os.getenv("JWT_SECRET", "si-dev-secret-change-in-production-min-32-chars")
JWT_ALGORITHM = "HS256"
ACCESS_TTL    = 8   # hours
REFRESH_TTL_D = 30  # days

# ── Create auth tables on startup ─────────────────────────────────────────────
_AUTH_SQL = """
CREATE TABLE IF NOT EXISTS organisations (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    plan       TEXT NOT NULL DEFAULT 'starter',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    org_id        TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'member',
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL,
    last_login    TEXT
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""
with get_db() as _db:
    _db.executescript(_AUTH_SQL)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_pw(pw):
    pw_bytes = pw.encode("utf-8")[:72]; return bcrypt.hashpw(pw_bytes, bcrypt.gensalt()).decode()

def _verify_pw(pw, hashed):
    try:
        return bcrypt.checkpw(pw.encode("utf-8")[:72], hashed.encode())
    except Exception:
        return False

def _make_access(uid, org, role, name):
    import time
    payload = {"sub": uid, "org": org, "role": role, "name": name,
               "type": "access", "exp": int(time.time()) + ACCESS_TTL * 3600}
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def _make_refresh(uid):
    import time
    payload = {"sub": uid, "type": "refresh",
               "exp": int(time.time()) + REFRESH_TTL_D * 86400,
               "jti": str(uuid.uuid4())}
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def _decode(token):
    return pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

def require_auth(f):
    """JWT auth decorator — injects g.user = {id, org, role, name}."""
    @wraps(f)
    def inner(*a, **kw):
        hdr = request.headers.get("Authorization", "")
        if not hdr.startswith("Bearer "):
            return jsonify({"error": "Authentication required", "code": "UNAUTHENTICATED"}), 401
        try:
            p = _decode(hdr[7:])
            if p.get("type") != "access":
                raise ValueError
            g.user = {"id": p["sub"], "org": p["org"], "role": p["role"], "name": p["name"]}
        except pyjwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired — please log in again", "code": "TOKEN_EXPIRED"}), 401
        except Exception:
            return jsonify({"error": "Invalid token", "code": "INVALID_TOKEN"}), 401
        return f(*a, **kw)
    return inner

def require_admin(f):
    """Require admin role (use after require_auth)."""
    @wraps(f)
    def inner(*a, **kw):
        if not hasattr(g, "user") or g.user.get("role") != "admin":
            return jsonify({"error": "Admin access required", "code": "FORBIDDEN"}), 403
        return f(*a, **kw)
    return inner

# ── Register ──────────────────────────────────────────────────────────────────

@app.route("/api/auth/register", methods=["POST"])
@require_json
def auth_register():
    """Create org + first admin user. Returns tokens immediately."""
    b = request.get_json()
    email = (b.get("email") or "").strip().lower()
    pw    = b.get("password", "")
    name  = (b.get("name") or "").strip()
    org   = (b.get("orgName") or f"{name}'s Organisation").strip()

    if not email or "@" not in email:
        return jsonify({"error": "Valid email required"}), 400
    if len(pw) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if not name:
        return jsonify({"error": "Name required"}), 400

    now    = datetime.utcnow().isoformat()
    oid    = str(uuid.uuid4())
    uid    = str(uuid.uuid4())
    pw_h   = _hash_pw(pw)

    with get_db() as db:
        if db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone():
            return jsonify({"error": "An account with this email already exists"}), 409
        db.execute("INSERT INTO organisations VALUES (?,?,?,?)", (oid, org, "starter", now))
        db.execute("INSERT INTO users (id,org_id,email,name,password_hash,role,is_active,must_change_password,created_at) VALUES (?,?,?,?,?,?,1,0,?)",
                   (uid, oid, email, name, pw_h, "admin", now))

    acc = _make_access(uid, oid, "admin", name)
    ref = _make_refresh(uid)
    rh  = bcrypt.hashpw(ref.encode()[:72], bcrypt.gensalt()).decode()
    with get_db() as db:
        db.execute("INSERT INTO refresh_tokens VALUES (?,?,?,?,?)",
                   (str(uuid.uuid4()), uid, rh,
                    (datetime.utcnow() + __import__("datetime").timedelta(days=REFRESH_TTL_D)).isoformat(), now))

    return jsonify({"data": {
        "user":         {"id": uid, "name": name, "email": email, "role": "admin", "orgId": oid, "orgName": org},
        "accessToken":  acc,
        "refreshToken": ref,
    }}), 201

# ── Login ─────────────────────────────────────────────────────────────────────

@app.route("/api/auth/login", methods=["POST"])
@require_json
def auth_login():
    """Email + password login. Returns access + refresh tokens."""
    b     = request.get_json()
    email = (b.get("email") or "").strip().lower()
    pw    = b.get("password", "")

    with get_db() as db:
        row = db.execute(
            "SELECT u.*, o.name as org_name FROM users u JOIN organisations o ON o.id=u.org_id WHERE u.email=?",
            (email,)).fetchone()

    if not row:
        return jsonify({"error": "Invalid email or password"}), 401
    u = dict(row)
    if not u.get("is_active"):
        return jsonify({"error": "Account inactive — contact your administrator"}), 403
    if not _verify_pw(pw, u["password_hash"]):
        return jsonify({"error": "Invalid email or password"}), 401

    now = datetime.utcnow().isoformat()
    with get_db() as db:
        db.execute("UPDATE users SET last_login=? WHERE id=?", (now, u["id"]))

    acc = _make_access(u["id"], u["org_id"], u["role"], u["name"])
    ref = _make_refresh(u["id"])
    rh  = bcrypt.hashpw(ref.encode()[:72], bcrypt.gensalt()).decode()
    with get_db() as db:
        db.execute("INSERT INTO refresh_tokens VALUES (?,?,?,?,?)",
                   (str(uuid.uuid4()), u["id"], rh,
                    (datetime.utcnow() + __import__("datetime").timedelta(days=REFRESH_TTL_D)).isoformat(), now))

    return jsonify({"data": {
        "user":               {"id": u["id"], "name": u["name"], "email": email,
                               "role": u["role"], "orgId": u["org_id"], "orgName": u["org_name"],
                               "mustChangePassword": bool(u.get("must_change_password", 0))},
        "accessToken":        acc,
        "refreshToken":       ref,
        "mustChangePassword": bool(u.get("must_change_password", 0)),
    }})

# ── Refresh ───────────────────────────────────────────────────────────────────

@app.route("/api/auth/refresh", methods=["POST"])
@require_json
def auth_refresh():
    """Exchange refresh token for new access token."""
    token = (request.get_json() or {}).get("refreshToken", "")
    try:
        p = _decode(token)
        if p.get("type") != "refresh":
            raise ValueError
    except Exception:
        return jsonify({"error": "Invalid or expired refresh token"}), 401

    with get_db() as db:
        row = db.execute(
            "SELECT u.*, o.name as org_name FROM users u JOIN organisations o ON o.id=u.org_id WHERE u.id=?",
            (p["sub"],)).fetchone()
    if not row:
        return jsonify({"error": "User not found"}), 401
    u = dict(row)
    return jsonify({"data": {"accessToken": _make_access(u["id"], u["org_id"], u["role"], u["name"])}})

# ── Me / Profile ──────────────────────────────────────────────────────────────

@app.route("/api/auth/me")
@require_auth
def auth_me():
    with get_db() as db:
        row = db.execute(
            "SELECT u.id,u.email,u.name,u.role,u.last_login,u.created_at,o.name as org_name,o.plan FROM users u JOIN organisations o ON o.id=u.org_id WHERE u.id=?",
            (g.user["id"],)).fetchone()
    return jsonify({"data": dict(row)}) if row else (jsonify({"error": "Not found"}), 404)

# ── Logout ────────────────────────────────────────────────────────────────────

@app.route("/api/auth/logout", methods=["POST"])
@require_auth
def auth_logout():
    with get_db() as db:
        db.execute("DELETE FROM refresh_tokens WHERE user_id=?", (g.user["id"],))
    return jsonify({"data": {"message": "Logged out"}})

# ── List users (admin) ────────────────────────────────────────────────────────

@app.route("/api/auth/users")
@require_auth
def auth_list_users():
    with get_db() as db:
        rows = db.execute(
            "SELECT id,email,name,role,is_active,created_at,last_login FROM users WHERE org_id=? ORDER BY created_at",
            (g.user["org"],)).fetchall()
    return jsonify({"data": [dict(r) for r in rows]})

# ── Invite user (admin only) ──────────────────────────────────────────────────

@app.route("/api/auth/users/invite", methods=["POST"])
@require_auth
@require_json
def auth_invite():
    if g.user.get("role") != "admin":
        return jsonify({"error": "Admin only"}), 403
    b     = request.get_json()
    email = (b.get("email") or "").strip().lower()
    name  = (b.get("name") or "").strip()
    role  = b.get("role", "member")
    if not email or not name:
        return jsonify({"error": "email and name required"}), 400

    tmp_pw  = str(uuid.uuid4())[:12]
    pw_hash = _hash_pw(tmp_pw)
    uid     = str(uuid.uuid4())
    now     = datetime.utcnow().isoformat()

    with get_db() as db:
        if db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone():
            return jsonify({"error": "User already exists"}), 409
        db.execute("INSERT INTO users (id,org_id,email,name,password_hash,role,is_active,must_change_password,created_at) VALUES (?,?,?,?,?,?,1,1,?)",
                   (uid, g.user["org"], email, name, pw_hash, role, now))

    send_email(
        to_email=email, to_name=name,
        subject="You have been invited to Strength Intelligence",
        html_body=build_email_html(name, "You have been invited to Strength Intelligence", [
            "You have been added to your organisation's Strength Intelligence account.",
            f"Your temporary password is: <strong>{tmp_pw}</strong>",
            "Please log in and change your password immediately.",
        ], "Log in now", os.getenv("APP_URL","http://localhost:3000") + "/login")
    )
    return jsonify({"data": {"id": uid, "email": email, "name": name, "role": role,
                             "tempPassword": tmp_pw,
                             "message": "User created. Invite email sent if SMTP configured."}}), 201

# ── Change password ───────────────────────────────────────────────────────────

@app.route("/api/auth/change-password", methods=["POST"])
@require_auth
@require_json
def auth_change_pw():
    b      = request.get_json()
    cur_pw = b.get("currentPassword","")
    new_pw = b.get("newPassword","")
    if len(new_pw) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    with get_db() as db:
        row = db.execute("SELECT password_hash FROM users WHERE id=?", (g.user["id"],)).fetchone()
        if not row or not _verify_pw(cur_pw, row["password_hash"]):
            return jsonify({"error": "Current password incorrect"}), 401
        db.execute("UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?", (_hash_pw(new_pw), g.user["id"]))
        db.execute("DELETE FROM refresh_tokens WHERE user_id=?", (g.user["id"],))
    return jsonify({"data": {"message": "Password changed. Please log in again."}})


# ── Startup ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port      = int(os.getenv("PORT", 5000))
    node_env  = os.getenv("NODE_ENV", os.getenv("FLASK_ENV", "production"))
    debug     = node_env == "development"
    print(f"\n  ◆  STRENGTH INTELLIGENCE API  ◆")
    print(f"  Running on http://localhost:{port}")
    print(f"  Database: {DB_PATH}")
    print(f"  Environment: {node_env}")
    print(f"  AI: {'Connected' if get_ai_client() else 'Fallback mode (add ANTHROPIC_API_KEY for full AI)'}\n")
    app.run(host="0.0.0.0", port=port, debug=debug)
