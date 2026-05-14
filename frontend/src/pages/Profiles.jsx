// ── PROFILES PAGE ────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { api } from "../utils/api";

const ARCH_COLORS = {
  growth:"#3DAA7A",clarity:"#5B8DEF",systems:"#8892A4",vision:"#5B8DEF",
  activation:"#E05060",stability:"#F0A040",admin:"#8892A4",innovation:"#9B6EE8",
  culture:"#3DAA7A",teaching:"#D4A843",relationship:"#D4537E",completion:"#2A7A5A"
};
const ARCH_LIGHT = {
  growth:"rgba(61,170,122,0.15)",clarity:"rgba(91,141,239,0.15)",systems:"rgba(136,146,164,0.15)",
  vision:"rgba(91,141,239,0.12)",activation:"rgba(224,80,96,0.15)",stability:"rgba(240,160,64,0.15)",
  admin:"rgba(136,146,164,0.10)",innovation:"rgba(155,110,232,0.15)",culture:"rgba(61,170,122,0.12)",
  teaching:"rgba(212,168,67,0.15)",relationship:"rgba(212,83,126,0.15)",completion:"rgba(42,122,90,0.15)"
};

export function Profiles({ onNavigate }) {
  const [profiles, setProfiles] = useState([]);
  const [assessments, setAssessments] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listProfiles().then(async r => {
      const ps = r.data;
      setProfiles(ps);
      // Fetch latest assessment for each profile
      const map = {};
      await Promise.all(ps.map(async p => {
        try {
          const ar = await api.getProfileAssessments(p.id);
          const completed = ar.data.filter(a => a.status === "completed");
          if (completed.length > 0) map[p.id] = completed[0];
        } catch {}
      }));
      setAssessments(map);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-center"><div className="spinner"/><span>Loading profiles...</span></div>;

  return (
    <div className="page">
      <div className="page-eyebrow">Intelligence Profiles</div>
      <div className="page-title">All Assessed Individuals</div>
      <div className="page-subtitle">Every profile is a complete strength intelligence record. Click to view assessment details.</div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <span style={{fontSize:11,color:"var(--muted)"}}>{profiles.length} profile{profiles.length!==1?"s":""} found</span>
        <button className="btn btn-primary btn-sm" onClick={()=>onNavigate("assessment")}>+ New assessment</button>
      </div>

      {profiles.length === 0 ? (
        <div className="card" style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:28,opacity:0.3,marginBottom:10}}>◇</div>
          <div style={{fontFamily:"var(--fd)",fontSize:17,color:"var(--bright)",marginBottom:6}}>No profiles yet</div>
          <div style={{fontSize:12,color:"var(--soft)",marginBottom:14}}>Run your first strength assessment to create a profile.</div>
          <button className="btn btn-primary btn-sm" onClick={()=>onNavigate("assessment")}>Start first assessment</button>
        </div>
      ) : (
        <div className="g2">
          {profiles.map(p => {
            const assessment = assessments[p.id];
            const primary = assessment?.scores?.find(s => s.isPrimary);
            const secondary = assessment?.scores?.find(s => s.isSecondary);
            return (
              <div key={p.id} className="profile-card">
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                  <div className="avatar" style={{width:42,height:42,background: primary ? ARCH_COLORS[primary.archetypeId] : "var(--gold)",fontSize:15,color:"var(--midnight)"}}>{p.initials}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--bright)"}}>{p.name}</div>
                    <div style={{fontSize:10,color:"var(--muted)"}}>{p.role}</div>
                  </div>
                  {assessment ? (
                    <span style={{fontSize:9,color:"var(--emerald)",background:"rgba(61,170,122,0.1)",padding:"2px 8px",borderRadius:999}}>Assessed</span>
                  ) : (
                    <span style={{fontSize:9,color:"var(--muted)",background:"rgba(255,255,255,0.05)",padding:"2px 8px",borderRadius:999}}>Pending</span>
                  )}
                </div>
                {primary && (
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                    <span className="badge" style={{background:ARCH_LIGHT[primary.archetypeId],color:ARCH_COLORS[primary.archetypeId],fontSize:9}}>◈ {primary.archetypeId}</span>
                    {secondary && <span className="badge" style={{background:ARCH_LIGHT[secondary.archetypeId],color:ARCH_COLORS[secondary.archetypeId],fontSize:9}}>◇ {secondary.archetypeId}</span>}
                  </div>
                )}
                {assessment && (
                  <div style={{marginTop:8}}>
                    {assessment.scores.slice(0,3).map(s => (
                      <div key={s.archetypeId} className="sbar" style={{marginBottom:7}}>
                        <div className="sbar-head">
                          <span className="sbar-label" style={{fontSize:10}}>{s.archetypeId}</span>
                          <span className="sbar-value" style={{fontSize:10,color:ARCH_COLORS[s.archetypeId]}}>{s.score}%</span>
                        </div>
                        <div className="sbar-track"><div className="sbar-fill" style={{width:`${s.score}%`,background:ARCH_COLORS[s.archetypeId]}}/></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── GAP ANALYSIS PAGE ─────────────────────────────────────────────────────────
export function GapAnalysis({ onNavigate }) {
  const [profiles, setProfiles]       = useState([]);
  const [assessments, setAssessments] = useState({});
  const [roles, setRoles]             = useState([]);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [selectedRole, setSelectedRole]       = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    api.listProfiles().then(r => { setProfiles(r.data); }).catch(()=>{});
    api.getRoles().then(r => { setRoles(r.data); if(r.data.length) setSelectedRole(r.data[0]); }).catch(()=>{});
  }, []);

  useEffect(() => {
    if (!selectedProfile) return;
    api.getProfileAssessments(selectedProfile).then(r => {
      const completed = r.data.filter(a => a.status==="completed");
      if (completed.length) setAssessments(prev => ({...prev, [selectedProfile]: completed[0]}));
    }).catch(()=>{});
  }, [selectedProfile]);

  async function runAnalysis() {
    const a = assessments[selectedProfile];
    if (!a) { setError("This profile has no completed assessment yet. Run an assessment first."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await api.runGapAnalysis({ assessmentId: a.id, targetRole: selectedRole });
      setResult(res.data);
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  }

  const priorityStyle = {
    HIGH: { bg:"rgba(224,80,96,0.12)", col:"#E05060" },
    MED:  { bg:"rgba(240,160,64,0.12)", col:"#F0A040" },
    LOW:  { bg:"rgba(61,170,122,0.12)", col:"#3DAA7A" },
  };

  return (
    <div className="page">
      <div className="page-eyebrow">Develop</div>
      <div className="page-title">Gap Analysis</div>
      <div className="page-subtitle">Compare current strengths to role requirements. Identify the delta. Build the path.</div>

      <div className="io-box">
        <div className="io-zone" style={{background:"rgba(61,170,122,0.08)",border:"1px solid rgba(61,170,122,0.3)"}}>
          <div className="io-zone-label" style={{color:"var(--emerald)"}}>What you put in</div>
          <div className="io-zone-item" style={{color:"var(--emerald)"}}>· A completed strength profile<br/>· A target role to compare against</div>
        </div>
        <div className="io-zone" style={{background:"rgba(212,168,67,0.08)",border:"1px solid rgba(212,168,67,0.3)"}}>
          <div className="io-zone-label" style={{color:"var(--gold)"}}>What you get out</div>
          <div className="io-zone-item" style={{color:"var(--gold)"}}>· HIGH / MED / LOW gap list<br/>· Current vs required scores<br/>· Overall alignment percentage</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Configure analysis</div>
        <div className="g2" style={{marginBottom:14}}>
          <div className="field">
            <label className="field-label">Select person</label>
            <select className="field-select" value={selectedProfile} onChange={e=>setSelectedProfile(e.target.value)}>
              <option value="">— choose a profile —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Target role</label>
            <select className="field-select" value={selectedRole} onChange={e=>setSelectedRole(e.target.value)}>
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        {error && <div className="notice notice-error" style={{marginBottom:10}}>{error}</div>}
        <button className="btn btn-primary" onClick={runAnalysis} disabled={loading||!selectedProfile}>
          {loading ? <><span className="spinner"/>&nbsp;Analysing...</> : "Run gap analysis →"}
        </button>
      </div>

      {result && (
        <div className="card">
          <div className="card-title">Gap analysis — {selectedRole}</div>
          <div className="g3" style={{marginBottom:16}}>
            <div className="stat"><div className="stat-value">{result.criticalCount}</div><div className="stat-label">Critical gaps (HIGH)</div></div>
            <div className="stat"><div className="stat-value">{result.overallAlignment}%</div><div className="stat-label">Overall alignment</div></div>
            <div className="stat"><div className="stat-value">{result.gaps.length}</div><div className="stat-label">Areas assessed</div></div>
          </div>
          {result.gaps.map((g, i) => {
            const ps = priorityStyle[g.priority] || priorityStyle.LOW;
            return (
              <div key={i} className="gap-item">
                <div className="gap-icon-box" style={{background:ps.bg}}>{g.icon}</div>
                <div style={{flex:1}}>
                  <div className="gap-title">{g.dimension}</div>
                  <div className="gap-desc">Current: {g.current}% → Required: {g.required}% (gap: {g.gap}%)</div>
                  <div className="sbar-track" style={{marginTop:6,width:"100%"}}>
                    <div style={{display:"flex",gap:0,height:6,borderRadius:3,overflow:"hidden",background:"var(--border)"}}>
                      <div style={{width:`${g.current}%`,background:"var(--gold)",transition:"width 0.8s ease"}}/>
                    </div>
                  </div>
                </div>
                <div className="gap-badge" style={{background:ps.bg,color:ps.col}}>{g.priority}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PERFORMANCE PAGE ──────────────────────────────────────────────────────────
export function Performance({ onNavigate }) {
  const [profiles, setProfiles] = useState([]);
  const [selected, setSelected] = useState("");
  const [goals, setGoals]       = useState([]);
  const [newGoal, setNewGoal]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => { api.listProfiles().then(r => { setProfiles(r.data); if(r.data.length) setSelected(r.data[0].id); }).catch(()=>{}); }, []);
  useEffect(() => { if(selected) api.getGoals(selected).then(r => setGoals(r.data)).catch(()=>setGoals([])); }, [selected]);

  async function addGoal() {
    if (!newGoal.trim()) return;
    setLoading(true);
    try {
      const res = await api.createGoal(selected, { text: newGoal });
      setGoals(prev => [...prev, res.data]);
      setNewGoal("");
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  }

  async function toggleGoal(goalId) {
    try {
      const res = await api.toggleGoal(goalId);
      setGoals(prev => prev.map(g => g.id===goalId ? res.data : g));
    } catch {}
  }

  const done = goals.filter(g => g.done).length;

  return (
    <div className="page">
      <div className="page-eyebrow">Develop</div>
      <div className="page-title">Performance Engine</div>
      <div className="page-subtitle">Strength-anchored goals. Track output, not just activity. Built for maximum alignment.</div>

      <div className="io-box">
        <div className="io-zone" style={{background:"rgba(61,170,122,0.08)",border:"1px solid rgba(61,170,122,0.3)"}}>
          <div className="io-zone-label" style={{color:"var(--emerald)"}}>What you put in</div>
          <div className="io-zone-item" style={{color:"var(--emerald)"}}>· Select a profile<br/>· Add strength-aligned goals<br/>· Mark progress as you go</div>
        </div>
        <div className="io-zone" style={{background:"rgba(212,168,67,0.08)",border:"1px solid rgba(212,168,67,0.3)"}}>
          <div className="io-zone-label" style={{color:"var(--gold)"}}>What you get out</div>
          <div className="io-zone-item" style={{color:"var(--gold)"}}>· Goal completion tracking<br/>· Progress at a glance<br/>· Alignment to strengths</div>
        </div>
      </div>

      <div className="card" style={{marginBottom:14}}>
        <div className="card-title">Select profile</div>
        <select className="field-select" value={selected} onChange={e=>setSelected(e.target.value)}>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
        </select>
      </div>

      {selected && (
        <>
          <div className="g3" style={{marginBottom:14}}>
            <div className="stat"><div className="stat-value">{goals.length}</div><div className="stat-label">Total goals</div></div>
            <div className="stat"><div className="stat-value">{done}</div><div className="stat-label" style={{color:"var(--emerald)"}}>Completed</div><div className="stat-trend">{goals.length ? Math.round((done/goals.length)*100) : 0}% done</div></div>
            <div className="stat"><div className="stat-value">{goals.length - done}</div><div className="stat-label">In progress</div></div>
          </div>

          <div className="card">
            <div className="card-title">Goals</div>
            {goals.map(g => (
              <div key={g.id} className="goal-item">
                <button className={`goal-check${g.done?" done":""}`} onClick={()=>toggleGoal(g.id)}>{g.done?"✓":""}</button>
                <div style={{fontSize:12,color:g.done?"var(--muted)":"var(--text)",textDecoration:g.done?"line-through":"none",flex:1}}>{g.text}</div>
              </div>
            ))}
            {goals.length === 0 && <div style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:"16px 0"}}>No goals yet — add one below</div>}
            {error && <div className="notice notice-error" style={{marginTop:10}}>{error}</div>}
            <div style={{display:"flex",gap:8,marginTop:14}}>
              <input className="field-input" style={{flex:1}} placeholder="Add a strength-aligned goal..." value={newGoal} onChange={e=>setNewGoal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addGoal()}/>
              <button className="btn btn-primary btn-sm" onClick={addGoal} disabled={loading||!newGoal.trim()}>
                {loading ? <span className="spinner"/> : "+ Add"}
              </button>
            </div>
          </div>
        </>
      )}

      {profiles.length === 0 && (
        <div className="card" style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:12,color:"var(--soft)",marginBottom:14}}>No profiles exist yet. Complete an assessment first.</div>
          <button className="btn btn-primary btn-sm" onClick={()=>onNavigate("assessment")}>Start assessment</button>
        </div>
      )}
    </div>
  );
}
