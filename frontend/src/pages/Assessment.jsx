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

const STEPS = [
  {id:"profile",    label:"Profile"},
  {id:"archetypes", label:"Archetypes"},
  {id:"questions",  label:"Questions"},
  {id:"energy",     label:"Energy"},
  {id:"results",    label:"Results"},
];

const ENERGY_RATINGS = [
  {val:"drain",   label:"Drains me",        col:"#E05060", bg:"rgba(224,80,96,0.15)"},
  {val:"neutral", label:"Neutral",           col:"#8892A4", bg:"rgba(136,146,164,0.12)"},
  {val:"give",    label:"Energises me",      col:"#3DAA7A", bg:"rgba(61,170,122,0.15)"},
  {val:"deep",    label:"Deeply energises",  col:"#D4A843", bg:"rgba(212,168,67,0.15)"},
];

export default function Assessment({ onNavigate }) {
  const [step, setStep]       = useState(0); // 0=profile,1=arch,2=q,3=energy,4=results
  const [archetypes, setArchetypes] = useState([]);
  const [questions, setQuestions]   = useState([]);
  const [energyActs, setEnergyActs] = useState([]);

  const [profile, setProfile] = useState({name:"",role:"",mode:"self",ageGroup:"adult"});
  const [profileId, setProfileId]     = useState(null);
  const [assessmentId, setAssessmentId] = useState(null);
  const [selectedArch, setSelectedArch] = useState([]);
  const [answers, setAnswers]           = useState({});
  const [energyRatings, setEnergyRatings] = useState({});
  const [result, setResult] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    api.getArchetypes().then(r => setArchetypes(r.data)).catch(()=>{});
    api.getQuestions().then(r => setQuestions(r.data)).catch(()=>{});
    api.getEnergyActivities().then(r => setEnergyActs(r.data)).catch(()=>{});
  }, []);

  // ── Step 0: Profile ──────────────────────────────────────────────────────

  async function submitProfile() {
    if (!profile.name.trim() || !profile.role.trim()) { setError("Name and role are required"); return; }
    setLoading(true); setError("");
    try {
      const res = await api.createProfile(profile);
      const pid = res.data.id;
      setProfileId(pid);
      const aRes = await api.createAssessment({ profileId: pid });
      setAssessmentId(aRes.data.id);
      setStep(1);
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  }

  // ── Step 1: Archetypes ───────────────────────────────────────────────────

  function toggleArch(id) {
    setSelectedArch(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) :
      prev.length < 3 ? [...prev, id] : prev
    );
  }

  // ── Step 2: Questions ────────────────────────────────────────────────────

  function setAnswer(qId, val) { setAnswers(prev => ({ ...prev, [qId]: val })); }

  // ── Step 3: Energy ───────────────────────────────────────────────────────

  function setEnergy(actId, val) { setEnergyRatings(prev => ({ ...prev, [actId]: val })); }

  // ── Step 4: Compute results ───────────────────────────────────────────────

  async function generateResults() {
    setLoading(true); setError("");
    try {
      const res = await api.completeAssessment(assessmentId, {
        selectedArchetypes: selectedArch,
        answers,
        energyRatings,
      });
      setResult(res.data);
      setStep(4);
      // Fetch AI narrative
      try {
        const aiRes = await api.interpret({ assessmentId });
        setNarrative(aiRes.data);
      } catch { /* narrative optional */ }
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  }

  function reset() {
    setStep(0); setProfile({name:"",role:"",mode:"self",ageGroup:"adult"});
    setProfileId(null); setAssessmentId(null); setSelectedArch([]);
    setAnswers({}); setEnergyRatings({}); setResult(null); setNarrative(null); setError("");
  }

  // ── RENDER ───────────────────────────────────────────────────────────────

  const primary   = result?.scores?.find(s => s.isPrimary);
  const secondary = result?.scores?.find(s => s.isSecondary);
  const archById  = Object.fromEntries(archetypes.map(a => [a.id, a]));

  return (
    <div className="page">
      <div className="page-eyebrow">Module 1</div>
      <div className="page-title">Strength Assessment</div>
      <div className="page-subtitle">Discover your primary and secondary Strength Stone through a guided five-step process.</div>

      {/* IO Box */}
      <div className="io-box">
        <div className="io-zone" style={{background:"rgba(61,170,122,0.08)",border:"1px solid rgba(61,170,122,0.3)"}}>
          <div className="io-zone-label" style={{color:"var(--emerald)"}}>What you put in</div>
          <div className="io-zone-item" style={{color:"var(--emerald)"}}>· Name, role, mode<br/>· Up to 3 strength archetypes<br/>· 7 behavioural questions<br/>· 12 energy ratings</div>
        </div>
        <div className="io-zone" style={{background:"rgba(212,168,67,0.08)",border:"1px solid rgba(212,168,67,0.3)"}}>
          <div className="io-zone-label" style={{color:"var(--gold)"}}>What you get out</div>
          <div className="io-zone-item" style={{color:"var(--gold)"}}>· Primary Strength Stone<br/>· Secondary Strength Stone<br/>· 12 archetype scores<br/>· Misalignment risk flags</div>
        </div>
      </div>

      {/* Wizard progress */}
      <div className="wizard">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <div className={`wstep${i < step?" done":i===step?" cur":""}`}>
              <div className={`wdot${i < step?" done":i===step?" cur":""}`}>{i < step ? "✓" : i+1}</div>
              <div className="wlabel">{s.label}</div>
            </div>
            {i < STEPS.length-1 && <div className={`wline${i < step?" done":""}`}/>}
          </React.Fragment>
        ))}
      </div>

      {error && <div className="notice notice-error" style={{marginBottom:14}}>⚠ {error}</div>}

      {/* ── STEP 0: PROFILE ── */}
      {step === 0 && (
        <div className="card">
          <div className="card-title">Tell us about this person</div>
          <div className="g2">
            <div className="field"><label className="field-label">Full name *</label><input className="field-input" value={profile.name} onChange={e=>setProfile(p=>({...p,name:e.target.value}))} placeholder="e.g. Amara Osei"/></div>
            <div className="field"><label className="field-label">Current or target role *</label><input className="field-input" value={profile.role} onChange={e=>setProfile(p=>({...p,role:e.target.value}))} placeholder="e.g. Product Manager"/></div>
            <div className="field"><label className="field-label">Assessment mode</label>
              <select className="field-select" value={profile.mode} onChange={e=>setProfile(p=>({...p,mode:e.target.value}))}>
                <option value="recruiter">Recruiter — assessing a candidate</option>
                <option value="self">Self — assessing myself</option>
                <option value="parent">Parent — exploring for my child</option>
                <option value="student">Student — mapping my career path</option>
              </select>
            </div>
            <div className="field"><label className="field-label">Age group</label>
              <select className="field-select" value={profile.ageGroup} onChange={e=>setProfile(p=>({...p,ageGroup:e.target.value}))}>
                <option value="adult">Adult (25+)</option>
                <option value="young_professional">Young professional (18–25)</option>
                <option value="student_teen">Student / teen (13–18)</option>
                <option value="preteen">Pre-teen (under 13)</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary" onClick={submitProfile} disabled={loading}>
            {loading ? <><span className="spinner"/>&nbsp;Creating...</> : "Continue to archetypes →"}
          </button>
        </div>
      )}

      {/* ── STEP 1: ARCHETYPES ── */}
      {step === 1 && (
        <div className="card">
          <div className="card-title">Select up to 3 resonating strength archetypes</div>
          <div style={{fontSize:11,color:"var(--soft)",marginBottom:14}}>Choose what feels most natural — not what you think you should be. These are your prior signals.</div>
          <div className="arch-grid">
            {archetypes.map(a => (
              <div key={a.id} className={`arch-card${selectedArch.includes(a.id)?" sel":""}`} onClick={()=>toggleArch(a.id)}>
                <span className="arch-icon">{a.icon}</span>
                <div className="arch-name">{a.name}</div>
                <div className="arch-desc">{a.description}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:11,color:"var(--muted)"}}>{selectedArch.length} of 3 selected</span>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setStep(0)}>← Back</button>
              <button className="btn btn-primary" onClick={()=>setStep(2)} disabled={selectedArch.length===0}>Continue to questions →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: QUESTIONS ── */}
      {step === 2 && (
        <div>
          <div className="card" style={{marginBottom:14}}>
            <div className="card-title">Behavioural questions — answer honestly</div>
            <div style={{fontSize:11,color:"var(--soft)"}}>There are no right or wrong answers. Your honest responses produce the most accurate profile.</div>
          </div>
          {questions.map((q, i) => (
            <div key={q.id} className="qblock">
              <div className="q-num">Question {i+1} of {questions.length}</div>
              <div className="q-text">{q.text}</div>
              {q.type === "open" && (
                <textarea className="field-textarea" placeholder="Share your honest reflection..." value={answers[q.id]||""} onChange={e=>setAnswer(q.id,e.target.value)}/>
              )}
              {q.type === "choice" && (
                <div className="q-opts">
                  {q.options.map((opt, oi) => (
                    <button key={oi} className={`q-opt${answers[q.id]===oi?" sel":""}`} onClick={()=>setAnswer(q.id,oi)}>{opt}</button>
                  ))}
                </div>
              )}
              {q.type === "scale" && (
                <>
                  <div className="scale-row">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} className={`scale-btn${answers[q.id]===n?" sel":""}`} onClick={()=>setAnswer(q.id,n)}>{n}</button>
                    ))}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                    <span style={{fontSize:9,color:"var(--muted)"}}>Not at all</span>
                    <span style={{fontSize:9,color:"var(--muted)"}}>Extremely</span>
                  </div>
                </>
              )}
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setStep(1)}>← Back</button>
            <button className="btn btn-primary" onClick={()=>setStep(3)}>Continue to energy map →</button>
          </div>
        </div>
      )}

      {/* ── STEP 3: ENERGY ── */}
      {step === 3 && (
        <div>
          <div className="card" style={{marginBottom:14}}>
            <div className="card-title">Energy mapping — rate each work activity</div>
            <div style={{fontSize:11,color:"var(--soft)"}}>What gives you energy reveals far more than what you have been trained to do. Rate honestly.</div>
          </div>
          {energyActs.map(act => (
            <div key={act.id} style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:500,color:"var(--text)",marginBottom:6}}>{act.label}</div>
              <div style={{display:"flex",gap:5}}>
                {ENERGY_RATINGS.map(r => (
                  <button key={r.val} onClick={()=>setEnergy(act.id,r.val)} style={{
                    flex:1,padding:"7px 4px",borderRadius:6,fontSize:9,fontWeight:600,cursor:"pointer",
                    transition:"var(--trans)",
                    background: energyRatings[act.id]===r.val ? r.bg : "none",
                    color: energyRatings[act.id]===r.val ? r.col : "var(--muted)",
                    border: `1px solid ${energyRatings[act.id]===r.val ? r.col : "var(--border)"}`,
                  }}>{r.label}</button>
                ))}
              </div>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setStep(2)}>← Back</button>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-ghost btn-sm" onClick={generateResults} disabled={loading}>Skip energy map</button>
              <button className="btn btn-primary" onClick={generateResults} disabled={loading}>
                {loading ? <><span className="spinner"/>&nbsp;Computing...</> : "Generate my strength profile →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4: RESULTS ── */}
      {step === 4 && result && (
        <div>
          <div className="card">
            {/* Profile header */}
            <div style={{display:"flex",alignItems:"center",gap:14,paddingBottom:16,borderBottom:"1px solid var(--border)",marginBottom:16}}>
              <div className="avatar" style={{width:52,height:52,background:"var(--gold)",fontSize:19,color:"var(--midnight)"}}>{profile.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:17,fontWeight:600,color:"var(--bright)"}}>{profile.name}</div>
                <div style={{fontSize:11,color:"var(--soft)"}}>{profile.role}</div>
                <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>
                  {primary && <span className="badge" style={{background:ARCH_LIGHT[primary.archetypeId],color:ARCH_COLORS[primary.archetypeId]}}>{archById[primary.archetypeId]?.icon} {archById[primary.archetypeId]?.gem}</span>}
                  {secondary && <span className="badge" style={{background:ARCH_LIGHT[secondary.archetypeId],color:ARCH_COLORS[secondary.archetypeId]}}>{archById[secondary.archetypeId]?.icon} {archById[secondary.archetypeId]?.gem}</span>}
                </div>
              </div>
            </div>

            {/* Stone cards */}
            <div className="stone-cards">
              {[primary, secondary].filter(Boolean).map((s, i) => {
                const a = archById[s.archetypeId] || {};
                return (
                  <div key={s.archetypeId} className="stone-c" style={{background:ARCH_LIGHT[s.archetypeId]}}>
                    <span className="stone-gem">{a.icon}</span>
                    <div className="stone-label" style={{color:ARCH_COLORS[s.archetypeId]}}>{i===0?"Primary":"Secondary"} Stone</div>
                    <div className="stone-name" style={{color:ARCH_COLORS[s.archetypeId]}}>{a.name}</div>
                  </div>
                );
              })}
              <div className="stone-c" style={{background:"rgba(224,80,96,0.1)"}}>
                <span className="stone-gem">⚠️</span>
                <div className="stone-label" style={{color:"var(--ruby)"}}>Watch Area</div>
                <div className="stone-name" style={{color:"var(--ruby)"}}>See risks below</div>
              </div>
            </div>

            {/* Scores */}
            <div className="card-title">Strength scores — all 12 archetypes</div>
            {result.scores.map(s => (
              <div key={s.archetypeId} className="sbar">
                <div className="sbar-head">
                  <span className="sbar-label">{archById[s.archetypeId]?.name || s.archetypeId}</span>
                  <span className="sbar-value" style={{color:ARCH_COLORS[s.archetypeId]}}>{s.score}%</span>
                </div>
                <div className="sbar-track"><div className="sbar-fill" style={{width:`${s.score}%`,background:ARCH_COLORS[s.archetypeId]}}/></div>
              </div>
            ))}

            {/* Risks */}
            <div className="card-title" style={{marginTop:16}}>Misalignment risks</div>
            {result.risks.map((r, i) => {
              const cols = {high:"#E05060",medium:"#F0A040",low:"#3DAA7A"};
              const bgs  = {high:"rgba(224,80,96,0.1)",medium:"rgba(240,160,64,0.1)",low:"rgba(61,170,122,0.1)"};
              return (
                <div key={i} className="risk-item" style={{background:bgs[r.level]}}>
                  <div className="risk-dot" style={{background:cols[r.level]}}/>
                  <div style={{fontSize:12,color:"var(--text)"}}>{r.description}</div>
                </div>
              );
            })}

            {/* AI Narrative */}
            {narrative && (
              <>
                <div className="card-title" style={{marginTop:16}}>AI-Powered Interpretation</div>
                <div className="narrative">
                  <div className="narrative-label">{narrative.aiPowered ? "Claude AI Insight" : "System Insight"}</div>
                  {narrative.narrative}
                </div>
              </>
            )}

            {/* Actions */}
            <div style={{display:"flex",gap:10,marginTop:18,flexWrap:"wrap"}}>
              <button className="btn btn-primary" onClick={()=>onNavigate("gap")}>Run gap analysis →</button>
              <button className="btn btn-outline" onClick={()=>onNavigate("profiles")}>View all profiles</button>
              <button className="btn btn-ghost btn-sm" onClick={reset}>Start new assessment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
