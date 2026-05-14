import React, { useState, useEffect } from "react";
import { api } from "../utils/api";

const ARCH_COLORS = {
  growth:"#3DAA7A",clarity:"#5B8DEF",systems:"#8892A4",vision:"#5B8DEF",
  activation:"#E05060",stability:"#F0A040",admin:"#8892A4",innovation:"#9B6EE8",
  culture:"#3DAA7A",teaching:"#D4A843",relationship:"#D4537E",completion:"#2A7A5A"
};

export default function Outcomes({ onNavigate }) {
  const [profiles,  setProfiles]  = useState([]);
  const [selected,  setSelected]  = useState("");
  const [assessment,setAssessment]= useState(null);
  const [summary,   setSummary]   = useState(null);
  const [form, setForm] = useState({ period:"30d", performanceRating:7, roleFitRating:7, engagementScore:7, managerNotes:"" });
  const [saved,  setSaved]  = useState(false);
  const [loading,setLoading]= useState(false);
  const [error,  setError]  = useState("");

  useEffect(() => {
    api.listProfiles().then(r => { setProfiles(r.data); if(r.data.length) setSelected(r.data[0].id); }).catch(()=>{});
    api.getOutcomesSummary().then(r => setSummary(r.data)).catch(()=>{});
  }, []);

  useEffect(() => {
    if(!selected) return;
    api.getProfileAssessments(selected)
      .then(r => {
        const done = r.data.filter(a => a.status==="completed");
        setAssessment(done[0] || null);
      }).catch(()=>{});
  }, [selected]);

  async function submit() {
    if(!assessment) { setError("This profile has no completed assessment."); return; }
    setLoading(true); setError("");
    try {
      await api.recordOutcome({
        assessmentId:      assessment.id,
        period:            form.period,
        performanceRating: Number(form.performanceRating),
        roleFitRating:     Number(form.roleFitRating),
        engagementScore:   Number(form.engagementScore),
        managerNotes:      form.managerNotes,
      });
      setSaved(true);
      const r = await api.getOutcomesSummary();
      setSummary(r.data);
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  }

  const validationPct = Math.min(100, Math.round(((summary?.count||0)/10)*100));

  return (
    <div className="page">
      <div className="page-eyebrow">Validation</div>
      <div className="page-title">Outcome Tracking</div>
      <div className="page-subtitle">
        This is the most important page in the system. Outcome data collected here proves — empirically — that SI scores predict real performance.
        Without this, the scores are an algorithm. With this, they become evidence.
      </div>

      {/* IO Box */}
      <div className="io-box">
        <div className="io-zone" style={{background:"rgba(61,170,122,0.08)",border:"1px solid rgba(61,170,122,0.3)"}}>
          <div className="io-zone-label" style={{color:"var(--emerald)"}}>What you put in</div>
          <div className="io-zone-item" style={{color:"var(--emerald)"}}>
            · A completed profile (30–90 days post-assessment)<br/>
            · Manager performance rating (1–10)<br/>
            · Role fit rating (1–10)<br/>
            · Engagement score (1–10)
          </div>
        </div>
        <div className="io-zone" style={{background:"rgba(212,168,67,0.08)",border:"1px solid rgba(212,168,67,0.3)"}}>
          <div className="io-zone-label" style={{color:"var(--gold)"}}>What you get out</div>
          <div className="io-zone-item" style={{color:"var(--gold)"}}>
            · Correlation data: high SI score = high performance?<br/>
            · Validation dataset for investor/enterprise conversations<br/>
            · Evidence that the scoring model works
          </div>
        </div>
      </div>

      {/* Validation progress bar */}
      <div className="card" style={{marginBottom:14}}>
        <div className="card-title">Validation progress — target: 10 outcome records</div>
        <div style={{height:8,background:"var(--border)",borderRadius:4,overflow:"hidden",marginBottom:8}}>
          <div style={{height:"100%",width:`${validationPct}%`,background:`linear-gradient(90deg,var(--emerald),var(--gold))`,borderRadius:4,transition:"width 0.9s ease"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
          <span style={{fontSize:11,color:"var(--soft)"}}>{summary?.count||0} records collected</span>
          <span style={{fontSize:11,color:"var(--gold)",fontWeight:600}}>{validationPct}% to first validation milestone</span>
        </div>
        <div style={{fontSize:11,color:"var(--muted)"}}>
          Collect 10+ outcome records to generate a validation report. Target: high-scoring profiles outperform low-scoring profiles on all three metrics.
        </div>
        {summary?.count > 0 && (
          <div style={{marginTop:12,display:"flex",gap:16,flexWrap:"wrap"}}>
            {[
              {label:"Avg performance rating", val:summary.avgPerformanceRating?.toFixed(1)+"/10", col:"var(--gold)"},
              {label:"Avg role fit",            val:summary.avgRoleFitRating?.toFixed(1)+"/10",     col:"var(--emerald)"},
              {label:"Avg engagement",          val:summary.avgEngagementScore?.toFixed(1)+"/10",   col:"var(--sapphire)"},
            ].map(m => (
              <div key={m.label} style={{background:"var(--deep)",borderRadius:8,padding:"10px 14px",flex:1,minWidth:130}}>
                <div style={{fontSize:20,fontFamily:"var(--fd)",fontWeight:600,color:m.col}}>{m.val}</div>
                <div style={{fontSize:10,color:"var(--muted)",marginTop:2}}>{m.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Record form */}
      <div className="card">
        <div className="card-title">Record a new outcome</div>
        <div style={{fontSize:11,color:"var(--soft)",marginBottom:16}}>
          Use this 30, 60, or 90 days after an assessment was completed. Ask the person's manager to rate performance honestly.
        </div>

        {saved && (
          <div className="notice notice-success" style={{marginBottom:14}}>
            ✓ Outcome recorded. This data has been added to the validation dataset. Each record strengthens the evidence that SI scores predict real performance.
          </div>
        )}
        {error && <div className="notice notice-error" style={{marginBottom:14}}>⚠ {error}</div>}

        <div className="g2" style={{marginBottom:14}}>
          <div className="field">
            <label className="field-label">Person assessed</label>
            <select className="field-select" value={selected} onChange={e=>{setSelected(e.target.value);setSaved(false);}}>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Measurement period</label>
            <select className="field-select" value={form.period} onChange={e=>setForm(f=>({...f,period:e.target.value}))}>
              <option value="30d">30 days post-assessment</option>
              <option value="60d">60 days post-assessment</option>
              <option value="90d">90 days post-assessment</option>
            </select>
          </div>
        </div>

        {assessment ? (
          <>
            <div style={{background:"var(--deep)",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:11}}>
              <span style={{color:"var(--muted)"}}>Linked assessment: </span>
              <span style={{color:"var(--gold)",fontWeight:600}}>
                {assessment.scores?.find(s=>s.isPrimary)?.archetypeId || "—"} primary stone
              </span>
              <span style={{color:"var(--muted)"}}> · completed {assessment.completedAt?.split("T")[0]}</span>
            </div>

            {[
              {key:"performanceRating", label:"Manager performance rating", hint:"How well did this person perform in their role?"},
              {key:"roleFitRating",     label:"Role fit rating",             hint:"How well does this role suit their natural strengths?"},
              {key:"engagementScore",   label:"Engagement score",            hint:"How energised and motivated do they appear at work?"},
            ].map(field => (
              <div key={field.key} className="field">
                <label className="field-label">{field.label} — {form[field.key]}/10</label>
                <div style={{fontSize:10,color:"var(--muted)",marginBottom:6}}>{field.hint}</div>
                <div style={{display:"flex",gap:5}}>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button key={n} onClick={()=>setForm(f=>({...f,[field.key]:n}))} style={{
                      flex:1,padding:"7px 2px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",
                      border:`1px solid ${form[field.key]===n?"var(--gold)":"var(--border)"}`,
                      background: form[field.key]===n?"var(--gold)":"transparent",
                      color: form[field.key]===n?"var(--midnight)":"var(--muted)",
                      transition:"var(--trans)"
                    }}>{n}</button>
                  ))}
                </div>
              </div>
            ))}

            <div className="field">
              <label className="field-label">Manager notes (optional)</label>
              <textarea className="field-textarea" placeholder="Any specific observations about how this person's strengths showed up (or didn't) in their role..." value={form.managerNotes} onChange={e=>setForm(f=>({...f,managerNotes:e.target.value}))}/>
            </div>

            <button className="btn btn-primary" onClick={submit} disabled={loading}>
              {loading ? <><span className="spinner"/>&nbsp;Saving...</> : "Record outcome →"}
            </button>
          </>
        ) : (
          <div style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:"16px 0"}}>
            This profile has no completed assessment yet.{" "}
            <button className="btn btn-ghost btn-sm" onClick={()=>onNavigate("assessment")} style={{display:"inline"}}>Run one now</button>
          </div>
        )}
      </div>

      {/* Why this matters */}
      <div className="card" style={{borderColor:"rgba(212,168,67,0.3)"}}>
        <div className="card-title">Why outcome tracking changes everything</div>
        {[
          "Right now, SI scores are algorithmically coherent. Outcome data makes them empirically defensible.",
          "10 records with consistent correlation is enough to start an enterprise sales conversation.",
          "50 records with clear pattern across multiple roles is publishable as a case study.",
          "100+ records is what separates a tool from a validated assessment instrument.",
          "Every record you enter today is evidence you present to your next investor or enterprise buyer.",
        ].map((item,i) => (
          <div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)",fontSize:12,color:"var(--text)"}}>
            <span style={{color:"var(--gold)",fontWeight:700,flexShrink:0}}>{i+1}.</span>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
