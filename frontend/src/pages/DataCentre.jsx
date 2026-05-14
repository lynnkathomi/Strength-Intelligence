import React, { useState, useEffect } from "react";
import { api } from "../utils/api";

const BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
const dcApi = {
  health:      () => fetch(`${BASE}/data-centre/health`).then(r=>r.json()),
  validation:  () => fetch(`${BASE}/data-centre/validation`).then(r=>r.json()),
  benchmarks:  () => fetch(`${BASE}/data-centre/benchmarks`).then(r=>r.json()),
  modelHealth: () => fetch(`${BASE}/data-centre/model-improvement`).then(r=>r.json()),
  exportData:  () => fetch(`${BASE}/data-centre/export`).then(r=>r.json()),
  waitlist:    () => fetch(`${BASE}/waitlist`).then(r=>r.json()),
  orgReport:   (email) => {
    const url = `${BASE}/reports/organisation${email?`?email=${email}`:""}`;
    window.open(url,"_blank");
  },
  profileReport: (pid, email) => {
    const url = `${BASE}/profiles/${pid}/report/pdf${email?`?email=${email}`:""}`;
    window.open(url,"_blank");
  },
};

const TABS = [
  {id:"health",     label:"Data Health"},
  {id:"validation", label:"Validation Study"},
  {id:"benchmarks", label:"Benchmarks"},
  {id:"model",      label:"Model Health"},
  {id:"leads",      label:"Lead Management"},
  {id:"reports",    label:"Report Export"},
];

function Stat({val,label,trend,col}) {
  return (
    <div className="stat">
      <div className="stat-value" style={{color:col||"var(--bright)"}}>{val}</div>
      <div className="stat-label">{label}</div>
      {trend && <div className="stat-trend" style={{color:col||"var(--emerald)"}}>{trend}</div>}
    </div>
  );
}

function Bar({pct,col}) {
  return (
    <div style={{height:6,background:"var(--border)",borderRadius:3,overflow:"hidden",flex:1}}>
      <div style={{height:"100%",width:`${Math.min(100,pct||0)}%`,background:col||"var(--gold)",
        borderRadius:3,transition:"width .9s ease"}}/>
    </div>
  );
}

export default function DataCentre({ onNavigate, reportsMode }) {
  const [tab,       setTab]       = useState(reportsMode ? "reports" : "health");
  const [health,    setHealth]    = useState(null);
  const [valid,     setValid]     = useState(null);
  const [bench,     setBench]     = useState(null);
  const [model,     setModel]     = useState(null);
  const [leads,     setLeads]     = useState(null);
  const [profiles,  setProfiles]  = useState([]);
  const [loading,   setLoading]   = useState({});
  const [email,     setEmail]     = useState("");
  const [selProfile,setSelProfile]= useState("");
  const [msg,       setMsg]       = useState("");

  useEffect(() => { load(); }, [tab]);
  useEffect(() => { api.listProfiles().then(r=>setProfiles(r.data)).catch(()=>{}); }, []);

  async function load() {
    setLoading(p=>({...p,[tab]:true}));
    try {
      if (tab==="health"    && !health)    setHealth(   (await dcApi.health()).data);
      if (tab==="validation"&& !valid)     setValid(    (await dcApi.validation()).data);
      if (tab==="benchmarks"&& !bench)     setBench(    (await dcApi.benchmarks()).data);
      if (tab==="model"     && !model)     setModel(    (await dcApi.modelHealth()).data);
      if (tab==="leads"     && !leads)     setLeads(    (await dcApi.waitlist()).data);
    } catch {}
    setLoading(p=>({...p,[tab]:false}));
  }

  const L = (t) => loading[t];

  return (
    <div className="page">
      <div className="eyebrow">Validation</div>
      <div className="page-title">{reportsMode ? "Reports & Export" : "Data Intelligence Centre"}</div>
      <div className="page-subtitle">
        {reportsMode
          ? "Download PDF reports for individual profiles and the organisation. Email reports directly to managers and boards."
          : "The validation layer that makes SI commercially defensible. Every record here is evidence. Every correlation is proof."}
      </div>

      {/* IO Box */}
      <div className="io-box">
        <div className="io-zone" style={{background:"rgba(61,170,122,.08)",border:"1px solid rgba(61,170,122,.3)"}}>
          <div className="io-zone-label" style={{color:"var(--emerald)"}}>What feeds in</div>
          <div className="io-zone-item" style={{color:"var(--emerald)"}}>
            · Completed strength assessments<br/>
            · Manager outcome ratings (30/60/90 day)<br/>
            · Goal check-ins with strength signals<br/>
            · Role benchmark accumulations
          </div>
        </div>
        <div className="io-zone" style={{background:"rgba(212,168,67,.08)",border:"1px solid rgba(212,168,67,.3)"}}>
          <div className="io-zone-label" style={{color:"var(--gold)"}}>What comes out</div>
          <div className="io-zone-item" style={{color:"var(--gold)"}}>
            · Correlation: score → performance<br/>
            · Validation dataset for investors<br/>
            · Downloadable PDF reports<br/>
            · Model calibration recommendations
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn${tab===t.id?" active":""}`}
            onClick={()=>{ setTab(t.id); setMsg(""); }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DATA HEALTH ── */}
      {tab==="health" && (
        L("health") ? <div className="loading-center"><div className="spinner"/></div>
        : health ? (
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
              <Stat val={health.dataHealth.totalProfiles}        label="Total profiles"/>
              <Stat val={health.dataHealth.usableForAnalysis}    label="Usable assessments" col="var(--gold)"/>
              <Stat val={health.dataHealth.outcomeRecords}       label="Outcome records"    col="var(--emerald)"/>
              <Stat val={`${health.validationReadiness.progressPct}%`} label="To milestone" col="var(--sapphire)"/>
            </div>

            <div className="card" style={{marginBottom:14}}>
              <div className="card-title">Validation Readiness</div>
              <div style={{height:8,background:"var(--border)",borderRadius:4,overflow:"hidden",marginBottom:8}}>
                <div style={{height:"100%",width:`${health.validationReadiness.progressPct}%`,
                  background:"linear-gradient(90deg,var(--emerald),var(--gold))",borderRadius:4,transition:"width .9s ease"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontSize:11,color:"var(--soft)"}}>{health.validationReadiness.status.toUpperCase()}</span>
                <span style={{fontSize:11,color:"var(--gold)",fontWeight:600}}>{health.validationReadiness.nextMilestone}</span>
              </div>
              <div style={{fontSize:12,fontStyle:"italic",color:"var(--soft)",fontFamily:"Georgia,serif"}}>
                {health.whatThisMeans}
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div className="card" style={{marginBottom:0}}>
                <div className="card-title">Data Quality Breakdown</div>
                {Object.entries(health.dataQuality).map(([q,count]) => (
                  <div key={q} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:11}}>
                      <span style={{color:"var(--soft)",textTransform:"capitalize"}}>{q} quality</span>
                      <span style={{color:q==="high"?"var(--emerald)":q==="medium"?"var(--gold)":"var(--ruby)",fontWeight:600}}>
                        {count} assessments
                      </span>
                    </div>
                    <Bar pct={health.dataHealth.completedAssessments ? count/health.dataHealth.completedAssessments*100 : 0}
                      col={q==="high"?"var(--emerald)":q==="medium"?"var(--gold)":"var(--ruby)"}/>
                  </div>
                ))}
              </div>
              <div className="card" style={{marginBottom:0}}>
                <div className="card-title">Table Summary</div>
                {[
                  ["Profiles",         health.dataHealth.totalProfiles],
                  ["Completed assessments", health.dataHealth.completedAssessments],
                  ["Outcome records",  health.dataHealth.outcomeRecords],
                  ["Goal check-ins",   health.dataHealth.goalCheckIns],
                  ["Active goals",     health.dataHealth.activeGoals],
                  ["Roles benchmarked",health.dataHealth.rolesWithBenchmarks],
                ].map(([l,v]) => (
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",
                    borderBottom:"1px solid var(--border)",fontSize:12}}>
                    <span style={{color:"var(--soft)"}}>{l}</span>
                    <span style={{color:"var(--gold)",fontWeight:600}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null
      )}

      {/* ── VALIDATION STUDY ── */}
      {tab==="validation" && (
        L("validation") ? <div className="loading-center"><div className="spinner"/></div>
        : valid ? (
          <>
            <div className="card" style={{borderColor:valid.status==="active"?"rgba(61,170,122,.4)":"var(--border)"}}>
              <div className="card-title">Correlation Signal — {(valid.correlationSignal||valid.status||"").toUpperCase()}</div>
              <div style={{fontSize:13,fontStyle:"italic",color:"var(--soft)",fontFamily:"Georgia,serif",
                marginBottom:14,lineHeight:1.65}}>
                {valid.interpretation || valid.message}
              </div>
              {valid.totalRecords > 0 && (
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  {[
                    ["highScore_70plus", "High scoring (70%+)"],
                    ["midScore_50_70",   "Mid scoring (50–70%)"],
                    ["lowScore_under50", "Low scoring (<50%)"],
                  ].map(([key, label]) => {
                    const band = valid.byScoreBand?.[key];
                    if (!band) return null;
                    return (
                      <div key={key} style={{background:"var(--deep)",border:"1px solid var(--border)",
                        borderRadius:10,padding:"14px 16px"}}>
                        <div style={{fontSize:10,color:"var(--muted)",marginBottom:8}}>{label} — {band.count} records</div>
                        {[["Avg performance",band.avgPerformance],["Avg role fit",band.avgRoleFit],["Avg engagement",band.avgEngagement]].map(([l,v])=>(
                          v != null && <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                            <span style={{color:"var(--soft)"}}>{l}</span>
                            <span style={{color:"var(--gold)",fontWeight:700}}>{v}/10</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {valid.status==="no_data" && (
              <div className="notice notice-gold">
                The validation study begins the moment the first manager rating is submitted in Outcome Tracking. Every rating moves this from "no data" to "evidence."
              </div>
            )}
          </>
        ) : null
      )}

      {/* ── BENCHMARKS ── */}
      {tab==="benchmarks" && (
        L("benchmarks") ? <div className="loading-center"><div className="spinner"/></div>
        : bench ? (
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
              <Stat val={bench.totalRoles}    label="Roles in database"/>
              <Stat val={bench.reliableRoles} label="Reliable benchmarks (5+ samples)" col="var(--emerald)"/>
              <Stat val={bench.totalRoles-bench.reliableRoles} label="Still building" col="var(--gold)"/>
            </div>
            {Object.entries(bench.byRole||{}).map(([role,data]) => {
              const rel = bench.reliability[role];
              return (
                <div key={role} className="card" style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div className="card-title" style={{marginBottom:0}}>{role}</div>
                    <span style={{fontSize:9,padding:"2px 9px",borderRadius:999,fontWeight:700,
                      background:rel?.reliable?"rgba(61,170,122,.1)":"rgba(212,168,67,.1)",
                      color:rel?.reliable?"var(--emerald)":"var(--gold)"}}>
                      {rel?.status?.toUpperCase()} — {rel?.message}
                    </span>
                  </div>
                  {data.archetypes.slice(0,6).map(a => (
                    <div key={a.archetypeId} style={{marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:11}}>
                        <span style={{color:"var(--soft)"}}>{a.archetypeId}</span>
                        <span style={{color:"var(--gold)",fontWeight:600}}>{a.meanScore}%</span>
                      </div>
                      <Bar pct={a.meanScore}/>
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        ) : null
      )}

      {/* ── MODEL HEALTH ── */}
      {tab==="model" && (
        L("model") ? <div className="loading-center"><div className="spinner"/></div>
        : model ? (
          <>
            <div className="card" style={{borderColor:model.modelHealth==="good"?"rgba(61,170,122,.4)":model.modelHealth==="needs_review"?"rgba(212,168,67,.4)":"rgba(224,80,96,.4)"}}>
              <div className="card-title">Model Health — {model.modelHealth?.toUpperCase()}</div>
              <div style={{fontSize:12,color:"var(--soft)",marginBottom:14}}>
                Based on {model.assessmentsAnalysed} assessments analysed.
              </div>
              {model.recommendations?.length > 0 ? (
                model.recommendations.map((r,i) => (
                  <div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)",fontSize:12}}>
                    <span style={{color:"var(--ruby)",flexShrink:0}}>⚠</span>
                    <span style={{color:"var(--body)"}}>{r}</span>
                  </div>
                ))
              ) : (
                <div style={{fontSize:12,color:"var(--emerald)"}}>✓ No calibration flags. Model looks healthy.</div>
              )}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div className="card" style={{marginBottom:0}}>
                <div className="card-title">Archetype Score Distribution</div>
                {Object.entries(model.archetypeScoreDistribution||{}).slice(0,8).map(([id,data]) => (
                  <div key={id} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:11}}>
                      <span style={{color:data.flag!=="normal"?"var(--ruby)":"var(--soft)"}}>{id}</span>
                      <span style={{fontWeight:600,color:data.flag!=="normal"?"var(--ruby)":"var(--gold)"}}>{data.mean}% {data.flag!=="normal"?"⚠":""}</span>
                    </div>
                    <Bar pct={data.mean} col={data.flag!=="normal"?"var(--ruby)":"var(--gold)"}/>
                  </div>
                ))}
              </div>
              <div className="card" style={{marginBottom:0}}>
                <div className="card-title">Question Discriminance</div>
                {Object.entries(model.questionDiscriminance||{}).map(([qid,data]) => (
                  <div key={qid} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",
                    borderBottom:"1px solid var(--border)",fontSize:11}}>
                    <span style={{color:"var(--soft)"}}>{qid}</span>
                    <span style={{color:data.flag==="low_discriminance"?"var(--ruby)":"var(--emerald)",fontWeight:600}}>
                      {data.uniqueValues} unique values {data.flag==="low_discriminance"?"⚠":"✓"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null
      )}

      {/* ── LEAD MANAGEMENT ── */}
      {tab==="leads" && (
        L("leads") ? <div className="loading-center"><div className="spinner"/></div>
        : (
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
              <Stat val={leads?.length||0} label="Total leads captured"/>
              <Stat val={leads?.filter(l=>l.source==="assessment").length||0} label="From assessment"/>
              <Stat val={leads?.filter(l=>l.source==="coach").length||0} label="From coaches"/>
            </div>
            <div className="card">
              <div className="card-title">Waitlist — All Leads</div>
              {leads?.length === 0 ? (
                <div style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:"24px 0"}}>
                  No leads yet. They appear here when someone completes an assessment and enters their email.
                </div>
              ) : (
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{borderBottom:"1px solid var(--border)"}}>
                      {["Name","Email","Role","Source","Date"].map(h=>(
                        <th key={h} style={{padding:"6px 8px",textAlign:"left",color:"var(--gold)",
                          fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leads?.map((l,i) => (
                      <tr key={l.id} style={{background:i%2===0?"transparent":"rgba(255,255,255,.02)"}}>
                        <td style={{padding:"7px 8px",color:"var(--body)"}}>{l.name||"—"}</td>
                        <td style={{padding:"7px 8px",color:"var(--soft)"}}>{l.email}</td>
                        <td style={{padding:"7px 8px",color:"var(--muted)"}}>{l.role||"—"}</td>
                        <td style={{padding:"7px 8px"}}><span style={{fontSize:9,padding:"1px 7px",borderRadius:999,
                          background:"rgba(212,168,67,.1)",color:"var(--gold)"}}>{l.source}</span></td>
                        <td style={{padding:"7px 8px",color:"var(--muted)"}}>{l.created_at?.slice(0,10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )
      )}

      {/* ── REPORTS ── */}
      {tab==="reports" && (
        <div>
          {msg && <div className="notice notice-success" style={{marginBottom:14}}>{msg}</div>}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            {/* Individual profile PDF */}
            <div className="card" style={{marginBottom:0}}>
              <div className="card-title">Individual Profile Report</div>
              <div style={{fontSize:12,color:"var(--soft)",marginBottom:14,lineHeight:1.6}}>
                Complete PDF for one person — primary stone, all 12 scores, gap analysis, goals, risks. Shareable with the individual, their manager, or a coach.
              </div>
              <div className="field" style={{marginBottom:10}}>
                <label className="field-label">Select profile</label>
                <select className="field-select" value={selProfile} onChange={e=>setSelProfile(e.target.value)}>
                  <option value="">— choose —</option>
                  {profiles.map(p=><option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
                </select>
              </div>
              <div className="field" style={{marginBottom:14}}>
                <label className="field-label">Email report to (optional)</label>
                <input className="field-input" type="email" value={email}
                  onChange={e=>setEmail(e.target.value)} placeholder="manager@organisation.com"/>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-primary btn-sm" disabled={!selProfile}
                  onClick={()=>{ dcApi.profileReport(selProfile, email||null); setMsg("PDF opening in new tab. If email was provided, it is being sent."); }}>
                  Download PDF →
                </button>
                {email && selProfile && (
                  <button className="btn btn-outline btn-sm"
                    onClick={()=>{ dcApi.profileReport(selProfile, email); setMsg("Report emailed to "+email); }}>
                    Email only
                  </button>
                )}
              </div>
            </div>

            {/* Org report PDF */}
            <div className="card" style={{marginBottom:0}}>
              <div className="card-title">Organisation Report</div>
              <div style={{fontSize:12,color:"var(--soft)",marginBottom:14,lineHeight:1.6}}>
                Management-level PDF — strength distribution across the organisation, validation progress, risk summary. For CHROs and boards.
              </div>
              <div className="field" style={{marginBottom:14}}>
                <label className="field-label">Email report to (optional)</label>
                <input className="field-input" type="email" placeholder="chro@organisation.com"
                  onChange={e=>setEmail(e.target.value)}/>
              </div>
              <button className="btn btn-primary btn-sm"
                onClick={()=>{ dcApi.orgReport(email||null); setMsg("Organisation PDF opening in new tab."); }}>
                Download Org Report →
              </button>
            </div>
          </div>

          {/* Email notifications */}
          <div className="card" style={{marginTop:14}}>
            <div className="card-title">Feedback Loop — Email Notifications</div>
            <div style={{fontSize:12,color:"var(--soft)",marginBottom:16,lineHeight:1.6}}>
              Configure email notifications in your <strong>.env</strong> file. Add SMTP_USER and SMTP_PASS to activate the full feedback loop.
            </div>
            {[
              {trigger:"Assessment completion","email":"Welcome + PDF report + 3-email nurture sequence","status":"Ready (needs SMTP)"},
              {trigger:"30-day post-assessment","email":"Manager outcome reminder with rating form link","status":"Ready (needs SMTP)"},
              {trigger:"Weekly learning plan","email":"Module nudge + weekly review invitation","status":"Ready (needs SMTP)"},
              {trigger:"Goal check-in due","email":"Reminder to record progress against goals","status":"Planned"},
              {trigger:"Validation milestone","email":"Data update when 10/25/50 outcome records reached","status":"Planned"},
            ].map((row,i) => (
              <div key={i} style={{display:"flex",gap:14,padding:"9px 0",borderBottom:"1px solid var(--border)",fontSize:11}}>
                <div style={{width:160,color:"var(--body)",fontWeight:600,flexShrink:0}}>{row.trigger}</div>
                <div style={{flex:1,color:"var(--soft)"}}>{row.email}</div>
                <span style={{fontSize:9,padding:"2px 8px",borderRadius:999,flexShrink:0,
                  background:row.status.includes("Ready")?"rgba(61,170,122,.1)":"rgba(212,168,67,.1)",
                  color:row.status.includes("Ready")?"var(--emerald)":"var(--gold)"}}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
