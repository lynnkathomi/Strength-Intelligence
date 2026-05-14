import React, { useState, useEffect } from "react";
import { api, lmsApi } from "../utils/api";

const ARCH_COLORS = {
  growth:"#3DAA7A",clarity:"#5B8DEF",systems:"#8892A4",vision:"#5B8DEF",
  activation:"#E05060",stability:"#F0A040",admin:"#8892A4",innovation:"#9B6EE8",
  culture:"#3DAA7A",teaching:"#D4A843",relationship:"#D4537E",completion:"#2A7A5A"
};
const ARCH_LIGHT = {
  growth:"rgba(61,170,122,0.12)",clarity:"rgba(91,141,239,0.12)",systems:"rgba(136,146,164,0.10)",
  vision:"rgba(91,141,239,0.10)",activation:"rgba(224,80,96,0.12)",stability:"rgba(240,160,64,0.12)",
  admin:"rgba(136,146,164,0.08)",innovation:"rgba(155,110,232,0.12)",culture:"rgba(61,170,122,0.10)",
  teaching:"rgba(212,168,67,0.12)",relationship:"rgba(212,83,126,0.12)",completion:"rgba(42,122,90,0.12)"
};
const TYPE_ICON = { course:"📖", book:"📚", workshop:"🛠", certification:"🏅" };
const PHASE_COLOR = ["","var(--emerald)","var(--gold)","var(--sapphire)"];
const PHASE_BG    = ["","rgba(61,170,122,0.08)","rgba(212,168,67,0.08)","rgba(91,141,239,0.08)"];

const SESSION_TYPES = [
  { id:"diagnose", icon:"🔍", label:"Diagnose My Gap",     desc:"Identify what I really need to learn" },
  { id:"feynman",  icon:"🧠", label:"Feynman Test Me",     desc:"Explain it back — expose what I don't know" },
  { id:"practice", icon:"⚡", label:"Practice Session",    desc:"Deliberate practice tied to my strengths" },
  { id:"mentor",   icon:"👔", label:"Senior Mentor Review",desc:"Get expert feedback on my work" },
  { id:"plateau",  icon:"📈", label:"Break My Plateau",    desc:"Stuck? Get unstuck with a 30-day plan" },
  { id:"weekly",   icon:"📋", label:"Weekly Review",       desc:"Grade my week and set next steps" },
];

export default function LMS({ onNavigate }) {
  const [tab, setTab] = useState("plans");
  const [profiles, setProfiles]           = useState([]);
  const [assessments, setAssessments]     = useState({});
  const [roles, setRoles]                 = useState([]);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [selectedRole, setSelectedRole]       = useState("");
  const [activePlan, setActivePlan]       = useState(null);
  const [profilePlans, setProfilePlans]   = useState([]);
  const [activeModule, setActiveModule]   = useState(null);
  const [sessionType, setSessionType]     = useState("practice");
  const [userInput, setUserInput]         = useState("");
  const [aiResponse, setAiResponse]       = useState("");
  const [weekData, setWeekData]           = useState({ hoursStudied:4, conceptsClicked:[""], conceptsStuck:[""], energyRating:7 });
  const [weekReview, setWeekReview]       = useState(null);
  const [loading, setLoading]             = useState(false);
  const [creating, setCreating]           = useState(false);
  const [error, setError]                 = useState("");

  useEffect(() => {
    api.listProfiles().then(r => { setProfiles(r.data); if(r.data.length) setSelectedProfile(r.data[0].id); }).catch(()=>{});
    api.getRoles().then(r => { setRoles(r.data); if(r.data.length) setSelectedRole(r.data[0]); }).catch(()=>{});
  }, []);

  useEffect(() => {
    if(!selectedProfile) return;
    api.getProfileAssessments(selectedProfile)
      .then(r => {
        const done = r.data.filter(a => a.status==="completed");
        if(done.length) setAssessments(prev => ({...prev, [selectedProfile]: done[0]}));
      }).catch(()=>{});
    lmsApi.getProfilePlans(selectedProfile)
      .then(r => setProfilePlans(r.data))
      .catch(()=>{});
  }, [selectedProfile]);

  async function createPlan() {
    const assessment = assessments[selectedProfile];
    if(!assessment) { setError("Complete a strength assessment first before generating a learning plan."); return; }
    setCreating(true); setError("");
    try {
      const res = await lmsApi.createPlan({ assessmentId: assessment.id, targetRole: selectedRole });
      setActivePlan(res.data);
      const updated = await lmsApi.getProfilePlans(selectedProfile);
      setProfilePlans(updated.data);
      setTab("curriculum");
    } catch(e) { setError(e.message); } finally { setCreating(false); }
  }

  async function updateProgress(modId, pct, reflection="") {
    try {
      await lmsApi.updateProgress(modId, { progress_pct: pct, reflection });
      // Refresh plan
      if(activePlan?.planId) {
        const r = await lmsApi.getPlan(activePlan.planId);
        setActivePlan(r.data);
      }
    } catch(e) { console.error(e); }
  }

  async function runAiSession() {
    if(!activeModule) { setError("Select a learning module first."); return; }
    setLoading(true); setAiResponse(""); setError("");
    try {
      const res = await lmsApi.aiSession({
        moduleId: activeModule.id,
        sessionType,
        userInput,
      });
      setAiResponse(res.data.response);
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  }

  async function submitWeeklyReview() {
    if(!activePlan) { setError("No active learning plan."); return; }
    setLoading(true); setError("");
    try {
      const planId = activePlan.planId || activePlan.id;
      const res = await lmsApi.weeklyReview({
        planId,
        weekNumber: 1,
        hoursStudied: weekData.hoursStudied,
        conceptsClicked: weekData.conceptsClicked.filter(Boolean),
        conceptsStuck: weekData.conceptsStuck.filter(Boolean),
        energyRating: weekData.energyRating,
      });
      setWeekReview(res.data);
      setTab("review");
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  }

  const modules  = activePlan?.modules || [];
  const phase1   = modules.filter(m => m.phase===1 || m.week_start<=5);
  const phase2   = modules.filter(m => m.phase===2 || (m.week_start>5 && m.week_start<=11));
  const phase3   = modules.filter(m => m.phase===3 || m.week_start>=12);
  const overall  = activePlan?.overallProgress ?? 0;

  return (
    <div className="page">
      <div className="page-eyebrow">Learning Engine</div>
      <div className="page-title">Strength-Activated Learning System</div>
      <div className="page-subtitle">
        Every course is derived from your assessed gap. Every coaching session is personalised to your primary stone.
        This is not a generic LMS — it is a development system that knows who you are.
      </div>

      {/* IO Box */}
      <div className="io-box">
        <div className="io-zone" style={{background:"rgba(61,170,122,0.08)",border:"1px solid rgba(61,170,122,0.3)"}}>
          <div className="io-zone-label" style={{color:"var(--emerald)"}}>What you put in</div>
          <div className="io-zone-item" style={{color:"var(--emerald)"}}>
            · Completed strength assessment<br/>· Target role<br/>· Weekly progress updates<br/>· Reflections and work samples for AI review
          </div>
        </div>
        <div className="io-zone" style={{background:"rgba(212,168,67,0.08)",border:"1px solid rgba(212,168,67,0.3)"}}>
          <div className="io-zone-label" style={{color:"var(--gold)"}}>What you get out</div>
          <div className="io-zone-item" style={{color:"var(--gold)"}}>
            · 16-week phased learning curriculum<br/>· Courses matched to your specific gaps<br/>· AI coaching in 6 modes (Feynman, mentor, practice…)<br/>· Weekly grade + next steps
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {[{id:"plans",label:"My Plans"},{id:"curriculum",label:"Curriculum"},{id:"coach",label:"AI Coach"},{id:"review",label:"Weekly Review"}].map(t => (
          <button key={t.id} className={`tab-btn${tab===t.id?" active":""}`} onClick={()=>setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {error && <div className="notice notice-error" style={{marginBottom:14}}>⚠ {error}</div>}

      {/* ── TAB: PLANS ── */}
      {tab==="plans" && (
        <div>
          <div className="card">
            <div className="card-title">Generate a new learning plan</div>
            <div style={{fontSize:11,color:"var(--soft)",marginBottom:14}}>
              Your gap analysis results are used to automatically sequence courses across 16 weeks — Phase 1 closes HIGH gaps, Phase 2 builds application, Phase 3 develops mastery.
            </div>
            <div className="g2" style={{marginBottom:14}}>
              <div className="field">
                <label className="field-label">Person</label>
                <select className="field-select" value={selectedProfile} onChange={e=>{setSelectedProfile(e.target.value);setActivePlan(null);}}>
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
            {!assessments[selectedProfile] && selectedProfile && (
              <div className="notice notice-info" style={{marginBottom:12}}>
                No completed assessment found for this person. <button className="btn btn-ghost btn-sm" onClick={()=>onNavigate&&onNavigate("assessment")} style={{display:"inline"}}>Run one first →</button>
              </div>
            )}
            <button className="btn btn-primary" onClick={createPlan} disabled={creating||!assessments[selectedProfile]}>
              {creating ? <><span className="spinner"/>&nbsp;Building curriculum...</> : "Generate 16-week learning plan →"}
            </button>
          </div>

          {/* Existing plans */}
          {profilePlans.length > 0 && (
            <div className="card">
              <div className="card-title">Existing learning plans</div>
              {profilePlans.map(plan => (
                <div key={plan.id} style={{padding:"12px 0",borderBottom:"1px solid var(--border)",cursor:"pointer"}}
                  onClick={()=>{setActivePlan(plan);setTab("curriculum");}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{plan.target_role}</div>
                      <div style={{fontSize:10,color:"var(--muted)"}}>Created {plan.created_at?.split("T")[0]} · {plan.modules?.length||0} modules</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:20,fontFamily:"var(--fd)",fontWeight:600,color:"var(--gold)"}}>{plan.overallProgress||0}%</div>
                      <div style={{fontSize:9,color:"var(--muted)"}}>complete</div>
                    </div>
                  </div>
                  <div style={{marginTop:8,height:4,background:"var(--border)",borderRadius:2,overflow:"hidden"}}>
                    <div style={{width:`${plan.overallProgress||0}%`,height:"100%",background:"var(--gold)",transition:"width 0.8s ease"}}/>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: CURRICULUM ── */}
      {tab==="curriculum" && (
        <div>
          {!activePlan ? (
            <div className="card" style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:28,opacity:0.3,marginBottom:10}}>◇</div>
              <div style={{fontFamily:"var(--fd)",fontSize:17,color:"var(--bright)",marginBottom:6}}>No active plan</div>
              <div style={{fontSize:12,color:"var(--soft)",marginBottom:14}}>Generate a learning plan from the Plans tab, or select an existing one.</div>
              <button className="btn btn-primary btn-sm" onClick={()=>setTab("plans")}>← Go to Plans</button>
            </div>
          ) : (
            <>
              {/* Plan header */}
              <div className="card" style={{marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div>
                    <div style={{fontFamily:"var(--fd)",fontSize:20,color:"var(--bright)"}}>{activePlan.target_role || activePlan.targetRole}</div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>{modules.length} modules · 16 weeks</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:26,fontFamily:"var(--fd)",fontWeight:600,color:"var(--gold)"}}>{overall}%</div>
                    <div style={{fontSize:9,color:"var(--muted)"}}>overall progress</div>
                  </div>
                </div>
                <div style={{height:6,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:`${overall}%`,height:"100%",background:`linear-gradient(90deg,var(--emerald),var(--gold))`,transition:"width 0.9s ease"}}/>
                </div>

                {/* Phase legend */}
                <div style={{display:"flex",gap:12,marginTop:12,flexWrap:"wrap"}}>
                  {[{p:1,l:"Phase 1: Foundation",w:"Wk 1–5"},{p:2,l:"Phase 2: Application",w:"Wk 6–11"},{p:3,l:"Phase 3: Mastery",w:"Wk 12–16"}].map(ph => (
                    <div key={ph.p} style={{display:"flex",alignItems:"center",gap:6,fontSize:10}}>
                      <div style={{width:8,height:8,borderRadius:2,background:PHASE_COLOR[ph.p]}}/>
                      <span style={{color:PHASE_COLOR[ph.p],fontWeight:600}}>{ph.l}</span>
                      <span style={{color:"var(--muted)"}}>{ph.w}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modules by phase */}
              {[[1,phase1,"Foundation — Close HIGH priority gaps"],[2,phase2,"Application — Build real skill"],[3,phase3,"Mastery — Portfolio evidence"]].map(([phNum,mods,desc]) => (
                mods.length > 0 && (
                  <div key={phNum} style={{marginBottom:14}}>
                    <div style={{fontSize:11,fontWeight:600,color:PHASE_COLOR[phNum],marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                      Phase {phNum} — {desc}
                    </div>
                    {mods.map(mod => {
                      const arch = mod.archetype_id || mod.archetypeId;
                      const col  = ARCH_COLORS[arch] || "var(--gold)";
                      const bg   = ARCH_LIGHT[arch]  || "rgba(212,168,67,0.08)";
                      const pct  = mod.progress_pct || 0;
                      const isActive = activeModule?.id === mod.id;
                      return (
                        <div key={mod.id} style={{
                          background: isActive ? bg : "var(--card)",
                          border: `1px solid ${isActive ? col : "var(--border)"}`,
                          borderRadius:10, padding:"14px 16px", marginBottom:8,
                          cursor:"pointer", transition:"var(--trans)"
                        }} onClick={()=>{ setActiveModule(mod); setTab("coach"); }}>
                          <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                            <div style={{fontSize:22,flexShrink:0}}>{TYPE_ICON[mod.course_type||mod.type]||"📖"}</div>
                            <div style={{flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                                <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{mod.course_title}</span>
                                <span className="badge" style={{background:bg,color:col,fontSize:9}}>{arch}</span>
                                {mod.priority==="HIGH" && <span className="badge" style={{background:"rgba(224,80,96,0.12)",color:"var(--ruby)",fontSize:9}}>HIGH gap</span>}
                              </div>
                              <div style={{fontSize:10,color:"var(--muted)"}}>
                                {mod.provider} · {mod.duration_weeks} weeks · starts week {mod.week_start}
                              </div>
                              {pct > 0 && (
                                <div style={{marginTop:8,height:4,background:"var(--border)",borderRadius:2,overflow:"hidden"}}>
                                  <div style={{width:`${pct}%`,height:"100%",background:col,transition:"width 0.8s ease"}}/>
                                </div>
                              )}
                            </div>
                            <div style={{textAlign:"right",flexShrink:0}}>
                              <div style={{fontSize:12,fontWeight:600,color:pct>=100?"var(--emerald)":pct>0?col:"var(--muted)"}}>
                                {pct>=100?"✓ Done":pct>0?`${pct}%`:"Not started"}
                              </div>
                              {pct<100 && (
                                <div style={{display:"flex",gap:4,marginTop:6,flexDirection:"column"}}>
                                  {[25,50,75,100].map(p => (
                                    <button key={p} className="btn btn-ghost btn-sm" style={{fontSize:9,padding:"2px 6px"}}
                                      onClick={e=>{e.stopPropagation();updateProgress(mod.id,p);}}>
                                      Mark {p}%
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ))}

              <button className="btn btn-outline btn-sm" onClick={()=>setTab("review")}>Submit weekly review →</button>
            </>
          )}
        </div>
      )}

      {/* ── TAB: AI COACH ── */}
      {tab==="coach" && (
        <div>
          <div className="card" style={{marginBottom:14}}>
            <div className="card-title">Select module to coach</div>
            {modules.length===0 ? (
              <div style={{fontSize:12,color:"var(--muted)"}}>Generate a learning plan first. <button className="btn btn-ghost btn-sm" style={{display:"inline"}} onClick={()=>setTab("plans")}>→ Plans tab</button></div>
            ) : (
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {modules.map(mod => {
                  const arch = mod.archetype_id || mod.archetypeId;
                  const col  = ARCH_COLORS[arch] || "var(--gold)";
                  const isActive = activeModule?.id === mod.id;
                  return (
                    <button key={mod.id} onClick={()=>setActiveModule(mod)} style={{
                      padding:"6px 12px",borderRadius:8,fontSize:11,cursor:"pointer",
                      border:`1px solid ${isActive ? col : "var(--border)"}`,
                      background: isActive ? ARCH_LIGHT[arch]||"rgba(212,168,67,0.12)" : "transparent",
                      color: isActive ? col : "var(--soft)", transition:"var(--trans)"
                    }}>{mod.course_title?.split(":")[0] || mod.course_title}</button>
                  );
                })}
              </div>
            )}
          </div>

          {activeModule && (
            <>
              {/* Active module info */}
              <div style={{background:"var(--deep)",borderRadius:10,padding:"12px 16px",marginBottom:14,border:"1px solid var(--border)"}}>
                <div style={{fontSize:11,color:"var(--soft)"}}>Coaching for:</div>
                <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginTop:2}}>{activeModule.course_title}</div>
                <div style={{fontSize:10,color:"var(--muted)",marginTop:2}}>
                  Gap archetype: {activeModule.archetype_id || activeModule.archetypeId} · Gap size: {activeModule.gap_size} pts · {activeModule.provider}
                </div>
              </div>

              {/* Session type picker */}
              <div className="card" style={{marginBottom:14}}>
                <div className="card-title">Choose coaching mode</div>
                <div className="g2">
                  {SESSION_TYPES.map(s => (
                    <div key={s.id} onClick={()=>setSessionType(s.id)} style={{
                      padding:"10px 12px",borderRadius:8,cursor:"pointer",
                      border:`1px solid ${sessionType===s.id ? "var(--gold)" : "var(--border)"}`,
                      background: sessionType===s.id ? "var(--gold-glow,rgba(212,168,67,0.1))" : "transparent",
                      transition:"var(--trans)"
                    }}>
                      <div style={{fontSize:16,marginBottom:3}}>{s.icon}</div>
                      <div style={{fontSize:11,fontWeight:600,color:sessionType===s.id?"var(--gold)":"var(--text)"}}>{s.label}</div>
                      <div style={{fontSize:9,color:"var(--muted)",marginTop:2}}>{s.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Input */}
              <div className="card" style={{marginBottom:14}}>
                <div className="card-title">Your input</div>
                <div style={{fontSize:11,color:"var(--soft)",marginBottom:8}}>
                  {sessionType==="feynman" && "Explain what you've learned so far — keep it messy, don't perfect it."}
                  {sessionType==="mentor" && "Paste your work, project output, or describe what you built this week."}
                  {sessionType==="practice" && "Describe your current level and what specifically you are practising today."}
                  {sessionType==="diagnose" && "Describe what you think you need to learn and why previous attempts haven't worked."}
                  {sessionType==="plateau" && "Describe what you can do well and what you keep failing at."}
                  {sessionType==="weekly" && "Summarise this week: what clicked, what didn't, your energy level."}
                </div>
                <textarea className="field-textarea" style={{minHeight:100}}
                  placeholder="Write here... the more specific you are, the better the AI coaching."
                  value={userInput} onChange={e=>setUserInput(e.target.value)}/>
                <button className="btn btn-primary" style={{marginTop:10}} onClick={runAiSession} disabled={loading}>
                  {loading ? <><span className="spinner"/>&nbsp;Coaching...</> : `Start ${sessionType} session →`}
                </button>
              </div>

              {/* AI Response */}
              {aiResponse && (
                <div className="card" style={{borderColor:"rgba(212,168,67,0.3)"}}>
                  <div className="card-title">AI Coaching Response</div>
                  <div style={{fontSize:13,color:"var(--text)",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{aiResponse}</div>
                  <div style={{marginTop:14,display:"flex",gap:8}}>
                    <button className="btn btn-outline btn-sm" onClick={()=>{setUserInput("");setAiResponse("");}}>Start fresh</button>
                    <button className="btn btn-primary btn-sm" onClick={()=>updateProgress(activeModule.id, Math.min(100, (activeModule.progress_pct||0)+25))}>
                      Mark +25% progress
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {!activeModule && (
            <div className="card" style={{textAlign:"center",padding:"32px 20px"}}>
              <div style={{fontSize:22,opacity:0.3,marginBottom:8}}>🧠</div>
              <div style={{fontFamily:"var(--fd)",fontSize:16,color:"var(--bright)",marginBottom:4}}>Select a module above to start coaching</div>
              <div style={{fontSize:11,color:"var(--soft)"}}>Each session is personalised to your strength profile and the specific gap you are closing.</div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: WEEKLY REVIEW ── */}
      {tab==="review" && (
        <div>
          {weekReview ? (
            <div className="card">
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
                <div style={{
                  width:56,height:56,borderRadius:12,
                  background: weekReview.grade==="A"?"var(--emerald)":weekReview.grade==="B"?"var(--gold)":weekReview.grade==="C"?"var(--amber,#F0A040)":"var(--ruby)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"var(--fd)",fontSize:28,fontWeight:700,color:"var(--midnight)"
                }}>{weekReview.grade}</div>
                <div>
                  <div style={{fontFamily:"var(--fd)",fontSize:20,color:"var(--bright)"}}>Week Review Complete</div>
                  <div style={{fontSize:11,color:"var(--muted)"}}>Grade: {weekReview.grade} · AI coaching delivered</div>
                </div>
              </div>
              <div style={{fontSize:13,color:"var(--text)",lineHeight:1.8,whiteSpace:"pre-wrap",marginBottom:16}}>{weekReview.aiReview}</div>
              <button className="btn btn-primary btn-sm" onClick={()=>setWeekReview(null)}>Submit another review</button>
            </div>
          ) : (
            <div className="card">
              <div className="card-title">Weekly learning review</div>
              <div style={{fontSize:11,color:"var(--soft)",marginBottom:16}}>
                This takes 3 minutes. The AI coach will review your week, identify what is working, grade you honestly, and give you a specific challenge for next week.
              </div>
              {!activePlan && (
                <div className="notice notice-info" style={{marginBottom:12}}>
                  No active plan selected. <button className="btn btn-ghost btn-sm" style={{display:"inline"}} onClick={()=>setTab("plans")}>Generate one →</button>
                </div>
              )}
              <div className="field">
                <label className="field-label">Hours studied this week — {weekData.hoursStudied}h</label>
                <input type="range" min={0} max={20} step={0.5} value={weekData.hoursStudied}
                  onChange={e=>setWeekData(d=>({...d,hoursStudied:Number(e.target.value)}))}
                  style={{width:"100%",accentColor:"var(--gold)"}}/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"var(--muted)",marginTop:2}}>
                  <span>0h</span><span>5h</span><span>10h</span><span>15h</span><span>20h</span>
                </div>
              </div>
              <div className="field">
                <label className="field-label">Concepts that clicked this week</label>
                <input className="field-input" placeholder="e.g. systems thinking, scenario planning..."
                  value={weekData.conceptsClicked[0]||""}
                  onChange={e=>setWeekData(d=>({...d,conceptsClicked:[e.target.value]}))}/>
              </div>
              <div className="field">
                <label className="field-label">Concepts I am still stuck on</label>
                <input className="field-input" placeholder="e.g. applying Pyramid Principle under pressure..."
                  value={weekData.conceptsStuck[0]||""}
                  onChange={e=>setWeekData(d=>({...d,conceptsStuck:[e.target.value]}))}/>
              </div>
              <div className="field">
                <label className="field-label">Motivation & energy this week — {weekData.energyRating}/10</label>
                <div style={{display:"flex",gap:5}}>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button key={n} onClick={()=>setWeekData(d=>({...d,energyRating:n}))} style={{
                      flex:1,padding:"6px 2px",borderRadius:5,fontSize:10,fontWeight:600,cursor:"pointer",
                      border:`1px solid ${weekData.energyRating===n?"var(--gold)":"var(--border)"}`,
                      background: weekData.energyRating===n?"var(--gold)":"transparent",
                      color: weekData.energyRating===n?"var(--midnight)":"var(--muted)",
                      transition:"var(--trans)"
                    }}>{n}</button>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" style={{marginTop:6}} onClick={submitWeeklyReview} disabled={loading||!activePlan}>
                {loading ? <><span className="spinner"/>&nbsp;Getting review...</> : "Get my weekly coaching review →"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
