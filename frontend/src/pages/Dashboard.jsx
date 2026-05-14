import React, { useEffect, useState } from "react";
import { api } from "../utils/api";

const ARCH_COLORS = {
  growth:"#3DAA7A",clarity:"#5B8DEF",systems:"#8892A4",vision:"#5B8DEF",
  activation:"#E05060",stability:"#F0A040",admin:"#8892A4",innovation:"#9B6EE8",
  culture:"#3DAA7A",teaching:"#D4A843",relationship:"#D4537E",completion:"#2A7A5A"
};

export default function Dashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getDashboard(), api.listProfiles(), api.getOutcomesSummary()])
      .then(([dash, profiles, outcomes]) => {
        setData({ ...dash.data, profiles: profiles.data });
        setValidation(outcomes.data);
      })
      .catch(() => setData({ totalProfiles:0, completedAssessments:0, outcomesRecorded:0, strengthDistribution:[], riskSummary:{high:0,medium:0,low:0}, profiles:[] }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-center"><div className="spinner"/><span>Loading dashboard...</span></div>;

  const dist = data.strengthDistribution || [];
  const validationPct = Math.min(100, Math.round(((data.outcomesRecorded||0) / 10) * 100));

  return (
    <div className="page">
      <div className="page-eyebrow">Strength Intelligence</div>
      <div className="page-title">Organisation Overview</div>
      <div className="page-subtitle">Live picture of your team's strengths, gaps, and validation progress.</div>

      {/* Validation progress banner */}
      <div style={{background:"rgba(212,168,67,0.08)",border:"1px solid rgba(212,168,67,0.3)",borderRadius:10,padding:"14px 18px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--gold)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Validation Progress</div>
          <div style={{fontSize:11,color:"var(--gold)"}}>{data.outcomesRecorded||0} / 10 outcomes recorded</div>
        </div>
        <div style={{height:6,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${validationPct}%`,background:"var(--gold)",transition:"width 0.9s ease",borderRadius:3}}/>
        </div>
        <div style={{fontSize:10,color:"var(--soft)",marginTop:6}}>{data.validationProgress || "Record outcome data 30–90 days post-assessment to build an evidence base that proves scores predict performance."}</div>
      </div>

      <div className="g4" style={{marginBottom:16}}>
        <div className="stat"><div className="stat-value">{data.totalProfiles}</div><div className="stat-label">Profiles assessed</div></div>
        <div className="stat"><div className="stat-value">{data.completedAssessments}</div><div className="stat-label">Assessments completed</div></div>
        <div className="stat"><div className="stat-value" style={{color:"var(--ruby)"}}>{data.riskSummary?.high||0}</div><div className="stat-label">High risk flags</div></div>
        <div className="stat"><div className="stat-value" style={{color:"var(--emerald)"}}>{data.outcomesRecorded||0}</div><div className="stat-label">Outcomes recorded</div></div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-title">Strength distribution</div>
          {dist.length === 0
            ? <div style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:"20px 0"}}>No assessments completed yet.<br/>Start an assessment to see distribution.</div>
            : dist.map(d => (
              <div key={d.archetypeId} className="sbar">
                <div className="sbar-head">
                  <span className="sbar-label">{d.archetypeId}</span>
                  <span className="sbar-value" style={{color:ARCH_COLORS[d.archetypeId]}}>{d.count}</span>
                </div>
                <div className="sbar-track"><div className="sbar-fill" style={{width:`${data.totalProfiles>0?Math.round((d.count/data.totalProfiles)*100):0}%`,background:ARCH_COLORS[d.archetypeId]}}/></div>
              </div>
            ))
          }
        </div>

        <div>
          <div className="card" style={{marginBottom:12}}>
            <div className="card-title">Validation status</div>
            <div style={{fontSize:12,color:"var(--text)",marginBottom:8}}>
              {validation?.count > 0
                ? <>Avg performance rating: <strong style={{color:"var(--gold)"}}>{validation.avgPerformanceRating}/10</strong><br/>Avg role fit: <strong style={{color:"var(--emerald)"}}>{validation.avgRoleFitRating}/10</strong><br/>Avg engagement: <strong style={{color:"var(--sapphire)"}}>{validation.avgEngagementScore}/10</strong></>
                : <span style={{color:"var(--muted)"}}>No outcome data yet. After completing assessments, return here 30–90 days later to record real performance results.</span>
              }
            </div>
            <button className="btn btn-outline btn-sm" onClick={()=>onNavigate("outcomes")}>Record outcomes →</button>
          </div>

          <div className="card">
            <div className="card-title">Recent profiles</div>
            {(data.profiles||[]).slice(0,4).map(p=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid var(--border)"}}>
                <div className="avatar" style={{width:28,height:28,background:"var(--gold)",fontSize:11,color:"var(--midnight)"}}>{p.initials}</div>
                <div><div style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>{p.name}</div><div style={{fontSize:10,color:"var(--muted)"}}>{p.role}</div></div>
              </div>
            ))}
            {(data.profiles||[]).length===0 && <div style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:"16px 0"}}>No profiles yet</div>}
          </div>
        </div>
      </div>

      <div style={{display:"flex",gap:10,marginTop:8,flexWrap:"wrap"}}>
        <button className="btn btn-primary" onClick={()=>onNavigate("assessment")}>+ Start assessment</button>
        <button className="btn btn-outline" onClick={()=>onNavigate("profiles")}>View profiles</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>onNavigate("outcomes")}>Record outcome data</button>
      </div>
    </div>
  );
}
