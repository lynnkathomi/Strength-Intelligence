// ── PERFORMANCE ENGINE — Measurable Outcomes ──────────────────────────────────
import React, { useState, useEffect, useCallback } from "react";
import { api, performanceApi } from "../utils/api";

// ── CONSTANTS ──────────────────────────────────────────────────────────────────

const ARCH_COLORS = {
  growth:"#3DAA7A",clarity:"#5B8DEF",systems:"#8892A4",vision:"#5B8DEF",
  activation:"#E05060",stability:"#F0A040",admin:"#8892A4",innovation:"#9B6EE8",
  culture:"#3DAA7A",teaching:"#D4A843",relationship:"#D4537E",completion:"#2A7A5A"
};
const ARCH_ICONS = {
  growth:"🌱",clarity:"💡",systems:"⚙️",vision:"🔭",activation:"⚡",
  stability:"🏛️",admin:"📋",innovation:"🚀",culture:"🕊️",
  teaching:"📚",relationship:"🤝",completion:"✅"
};

const GOAL_TYPES = [
  { id:"quantitative",  label:"Quantitative",  icon:"📊", desc:"Number-based: track a metric from baseline to target",         color:"var(--sapphire)" },
  { id:"qualitative",   label:"Qualitative",   icon:"💬", desc:"Behaviour-based: observable indicators and evidence",           color:"var(--emerald)" },
  { id:"behavioural",   label:"Behavioural",   icon:"🎯", desc:"Habit or practice: consistency measured over check-ins",        color:"var(--violet)" },
  { id:"learning",      label:"Learning",      icon:"📚", desc:"Knowledge or skill: linked to a learning plan module",          color:"var(--gold)" },
];

const CATEGORIES = [
  { id:"growth",      label:"Growth & Development", icon:"🌱" },
  { id:"performance", label:"Performance",          icon:"📈" },
  { id:"learning",    label:"Learning",             icon:"📚" },
  { id:"leadership",  label:"Leadership",           icon:"🎯" },
  { id:"relationship",label:"Relationships",        icon:"🤝" },
];

const REVIEW_FREQ = ["weekly","monthly","quarterly"];

const TYPE_COLOR = {
  quantitative:"var(--sapphire)",qualitative:"var(--emerald)",
  behavioural:"var(--violet)",learning:"var(--gold)"
};
const TYPE_BG = {
  quantitative:"rgba(91,141,239,0.1)",qualitative:"rgba(61,170,122,0.1)",
  behavioural:"rgba(155,110,232,0.1)",learning:"rgba(212,168,67,0.1)"
};
const CAT_ICONS = { growth:"🌱",performance:"📈",learning:"📚",leadership:"🎯",relationship:"🤝" };

// ── HELPERS ────────────────────────────────────────────────────────────────────

function ProgressRing({ pct, size=54, color="var(--gold)", done }) {
  const r   = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = ((pct || 0) / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)", flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={done?"var(--emerald)":color}
        strokeWidth={5} strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round" style={{transition:"stroke-dasharray .9s ease"}}/>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
        style={{transform:"rotate(90deg)",transformOrigin:"center",fill:done?"var(--emerald)":color,
          fontSize:size*.22,fontWeight:700,fontFamily:"'DM Sans',sans-serif"}}>
        {done ? "✓" : `${pct||0}%`}
      </text>
    </svg>
  );
}

function DueBadge({ daysUntilDue, isOverdue }) {
  if (daysUntilDue === null || daysUntilDue === undefined) return null;
  if (isOverdue) return (
    <span style={{fontSize:9,padding:"2px 7px",borderRadius:999,background:"rgba(224,80,96,.15)",
      color:"var(--ruby)",fontWeight:700}}>⚠ {Math.abs(daysUntilDue)}d overdue</span>
  );
  if (daysUntilDue <= 7) return (
    <span style={{fontSize:9,padding:"2px 7px",borderRadius:999,background:"rgba(240,160,64,.15)",
      color:"var(--amber)",fontWeight:700}}>Due in {daysUntilDue}d</span>
  );
  return (
    <span style={{fontSize:9,padding:"2px 7px",borderRadius:999,background:"rgba(255,255,255,.05)",
      color:"var(--muted)"}}>Due {daysUntilDue}d</span>
  );
}

function StrengthPill({ showedUp, blocked }) {
  if (!showedUp && !blocked) return null;
  return (
    <span style={{fontSize:9,padding:"2px 7px",borderRadius:999,
      background: showedUp ? "rgba(61,170,122,.12)" : "rgba(224,80,96,.12)",
      color: showedUp ? "var(--emerald)" : "var(--ruby)"}}>
      {showedUp ? "🌱 Strength helped" : "⚠ Gap showed up"}
    </span>
  );
}

// ── GOAL CARD ──────────────────────────────────────────────────────────────────

function GoalCard({ goal, onCheckIn, onToggle, onExpand, expanded }) {
  const typeColor = TYPE_COLOR[goal.goal_type] || "var(--gold)";
  const typeBg    = TYPE_BG[goal.goal_type]    || "rgba(212,168,67,0.1)";
  const archColor = ARCH_COLORS[goal.archetype_alignment] || "var(--gold)";
  const archIcon  = ARCH_ICONS[goal.archetype_alignment]  || "◇";

  return (
    <div style={{
      background:"var(--card)",border:`1px solid ${goal.isOverdue?"rgba(224,80,96,.4)":goal.done?"rgba(61,170,122,.3)":"var(--border)"}`,
      borderRadius:14,marginBottom:12,overflow:"hidden",
      transition:"border .2s",opacity:goal.done?.8:1
    }}>
      {/* Main row */}
      <div style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:14,cursor:"pointer"}}
        onClick={() => onExpand(goal.id)}>
        <ProgressRing pct={goal.progress_pct} done={goal.done} color={typeColor}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5,flexWrap:"wrap"}}>
            <span style={{fontSize:9,padding:"2px 9px",borderRadius:999,background:typeBg,
              color:typeColor,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em"}}>
              {GOAL_TYPES.find(t=>t.id===goal.goal_type)?.icon} {goal.goal_type}
            </span>
            <span style={{fontSize:9,padding:"2px 8px",borderRadius:999,background:"rgba(255,255,255,.05)",
              color:"var(--soft)"}}>{CAT_ICONS[goal.category]} {goal.category}</span>
            {goal.archetype_alignment && (
              <span style={{fontSize:9,padding:"2px 8px",borderRadius:999,
                background:`${archColor}18`,color:archColor}}>
                {archIcon} {goal.archetype_alignment}
              </span>
            )}
            <DueBadge daysUntilDue={goal.daysUntilDue} isOverdue={goal.isOverdue}/>
          </div>
          <div style={{fontSize:13,fontWeight:600,color:goal.done?"var(--muted)":"var(--bright)",
            textDecoration:goal.done?"line-through":"none",lineHeight:1.4,marginBottom:4}}>
            {goal.text}
          </div>
          <div style={{fontSize:10,color:"var(--muted)"}}>
            {goal.progressLabel}
            {goal.check_in_count > 0 && ` · ${goal.check_in_count} check-in${goal.check_in_count!==1?"s":""}`}
            {goal.last_check_in && ` · Last: ${goal.last_check_in.slice(0,10)}`}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
          <button onClick={e=>{e.stopPropagation();onToggle(goal.id,goal.done)}}
            style={{width:22,height:22,borderRadius:"50%",border:`1.5px solid ${goal.done?"var(--emerald)":"var(--gold)"}`,
              background:goal.done?"var(--emerald)":"transparent",color:goal.done?"var(--midnight)":"var(--gold)",
              cursor:"pointer",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",
              transition:"all .15s"}}>
            {goal.done?"✓":""}
          </button>
          <span style={{fontSize:9,color:"var(--muted)"}}>{expanded?"▲":"▼"}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{borderTop:"1px solid var(--border)",padding:"14px 18px",background:"rgba(0,0,0,.15)"}}>
          {/* Quantitative specifics */}
          {goal.goal_type === "quantitative" && goal.metric_name && (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:600,color:"var(--sapphire)",marginBottom:8,
                textTransform:"uppercase",letterSpacing:".06em"}}>📊 Metric Tracking</div>
              <div style={{display:"flex",gap:10}}>
                {[
                  ["Baseline",goal.baseline_value,goal.metric_unit,"var(--muted)"],
                  ["Current", goal.current_value, goal.metric_unit,"var(--gold)"],
                  ["Target",  goal.target_value,  goal.metric_unit,"var(--sapphire)"],
                ].map(([l,v,u,col])=>(
                  <div key={l} style={{flex:1,background:"var(--deep)",borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:9,color:"var(--muted)",marginBottom:3}}>{l}</div>
                    <div style={{fontSize:18,fontFamily:"'Cormorant Garamond',serif",fontWeight:700,
                      color:col}}>{v ?? "—"}<span style={{fontSize:11,marginLeft:2}}>{u}</span></div>
                  </div>
                ))}
              </div>
              {goal.measurement_method && (
                <div style={{fontSize:11,color:"var(--soft)",marginTop:8}}>
                  <strong style={{color:"var(--muted)"}}>Measured by:</strong> {goal.measurement_method}
                </div>
              )}
            </div>
          )}

          {/* Qualitative / behavioural specifics */}
          {(goal.goal_type === "qualitative" || goal.goal_type === "behavioural") && (
            <div style={{marginBottom:14}}>
              {goal.success_indicators?.length > 0 && (
                <>
                  <div style={{fontSize:10,fontWeight:600,color:"var(--emerald)",marginBottom:8,
                    textTransform:"uppercase",letterSpacing:".06em"}}>✓ Success Indicators</div>
                  {(Array.isArray(goal.success_indicators)?goal.success_indicators:[goal.success_indicators]).map((ind,i) => (
                    <div key={i} style={{display:"flex",gap:8,marginBottom:5}}>
                      <span style={{color:"var(--emerald)",flexShrink:0}}>·</span>
                      <span style={{fontSize:12,color:"var(--body)"}}>{ind}</span>
                    </div>
                  ))}
                </>
              )}
              {goal.evidence_required && (
                <div style={{fontSize:11,color:"var(--soft)",marginTop:8}}>
                  <strong style={{color:"var(--muted)"}}>Evidence required:</strong> {goal.evidence_required}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {goal.notes && (
            <div style={{fontSize:11,color:"var(--soft)",marginBottom:12,fontStyle:"italic"}}>
              {goal.notes}
            </div>
          )}

          {/* Check-in button */}
          {!goal.done && (
            <button className="btn btn-primary btn-sm" onClick={() => onCheckIn(goal)}>
              Record check-in →
            </button>
          )}
          {goal.done && goal.completion_evidence && (
            <div style={{fontSize:11,color:"var(--emerald)",background:"rgba(61,170,122,.08)",
              border:"1px solid rgba(61,170,122,.2)",borderRadius:8,padding:"8px 12px"}}>
              <strong>Completion evidence:</strong> {goal.completion_evidence}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CHECK-IN MODAL ─────────────────────────────────────────────────────────────

function CheckInModal({ goal, onSave, onClose }) {
  const [form, setForm] = useState({
    currentValue: goal.current_value || "",
    qualitativeNotes: "",
    evidenceThisPeriod: "",
    selfRating: 7,
    managerRating: "",
    strengthShowedUp: false,
    strengthBlocked: false,
  });
  const [saving, setSaving] = useState(false);

  const isQuant = goal.goal_type === "quantitative";

  async function save() {
    setSaving(true);
    try {
      await onSave(goal.id, {
        ...form,
        currentValue:      isQuant ? Number(form.currentValue) : undefined,
        selfRating:        Number(form.selfRating),
        managerRating:     form.managerRating ? Number(form.managerRating) : undefined,
      });
      onClose();
    } catch(e) { alert(e.message); } finally { setSaving(false); }
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,
        padding:28,width:"min(560px,95vw)",maxHeight:"85vh",overflowY:"auto"}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontSize:10,color:"var(--gold)",fontWeight:700,textTransform:"uppercase",
              letterSpacing:".08em",marginBottom:4}}>Record Check-in</div>
            <div style={{fontSize:14,fontWeight:600,color:"var(--bright)",lineHeight:1.35}}>
              {goal.text}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--muted)",
            fontSize:20,cursor:"pointer"}}>×</button>
        </div>

        {/* Quantitative: current reading */}
        {isQuant && (
          <div className="field">
            <label className="field-label">
              Current {goal.metric_name} reading ({goal.metric_unit})
            </label>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <input className="field-input" type="number"
                value={form.currentValue}
                onChange={e=>setForm(f=>({...f,currentValue:e.target.value}))}
                placeholder={`Baseline: ${goal.baseline_value} → Target: ${goal.target_value}`}
              />
              <div style={{background:"var(--deep)",borderRadius:8,padding:"8px 12px",
                fontSize:10,color:"var(--muted)",whiteSpace:"nowrap",flexShrink:0}}>
                Target: <strong style={{color:"var(--sapphire)"}}>{goal.target_value}{goal.metric_unit}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Qualitative: notes + evidence */}
        {!isQuant && (
          <>
            <div className="field">
              <label className="field-label">What happened this period?</label>
              <textarea className="field-textarea"
                value={form.qualitativeNotes}
                onChange={e=>setForm(f=>({...f,qualitativeNotes:e.target.value}))}
                placeholder="Describe specific situations where you practiced or demonstrated this goal..."
              />
            </div>
            <div className="field">
              <label className="field-label">Evidence collected this period</label>
              <textarea className="field-textarea" style={{minHeight:60}}
                value={form.evidenceThisPeriod}
                onChange={e=>setForm(f=>({...f,evidenceThisPeriod:e.target.value}))}
                placeholder="e.g. Manager feedback in 1:1, 360 comment, artifact created, session delivered..."
              />
            </div>
          </>
        )}

        {/* Self rating — always */}
        <div className="field">
          <label className="field-label">
            My confidence in progress this period — {form.selfRating}/10
          </label>
          <div style={{display:"flex",gap:4}}>
            {[1,2,3,4,5,6,7,8,9,10].map(n=>(
              <button key={n} onClick={()=>setForm(f=>({...f,selfRating:n}))}
                style={{flex:1,padding:"7px 2px",borderRadius:6,fontSize:10,fontWeight:600,
                  cursor:"pointer",transition:"all .15s",
                  border:`1px solid ${form.selfRating===n?"var(--gold)":"var(--border)"}`,
                  background:form.selfRating===n?"var(--gold)":"transparent",
                  color:form.selfRating===n?"var(--midnight)":"var(--muted)"}}>
                {n}
              </button>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:9,color:"var(--muted)"}}>
            <span>Not confident</span><span>Very confident</span>
          </div>
        </div>

        {/* Manager rating (optional) */}
        <div className="field">
          <label className="field-label">Manager rating this period (optional — 1–10)</label>
          <input className="field-input" type="number" min={1} max={10}
            value={form.managerRating}
            onChange={e=>setForm(f=>({...f,managerRating:e.target.value}))}
            placeholder="Leave blank if no manager review this period"
          />
        </div>

        {/* Strength signals */}
        <div style={{display:"flex",gap:10,marginBottom:16}}>
          {[
            {key:"strengthShowedUp",label:"My primary strength helped this goal","col":"var(--emerald)","bg":"rgba(61,170,122,.1)"},
            {key:"strengthBlocked", label:"A gap or weakness showed up","col":"var(--ruby)",   "bg":"rgba(224,80,96,.1)"},
          ].map(opt=>(
            <button key={opt.key}
              onClick={()=>setForm(f=>({...f,[opt.key]:!f[opt.key]}))}
              style={{flex:1,padding:"9px 12px",borderRadius:10,cursor:"pointer",
                border:`1px solid ${form[opt.key]?opt.col:"var(--border)"}`,
                background:form[opt.key]?opt.bg:"transparent",
                color:form[opt.key]?opt.col:"var(--muted)",fontSize:11,
                fontFamily:"var(--ff)",textAlign:"left",lineHeight:1.4,transition:"all .15s"}}>
              {form[opt.key]?"✓ ":""}{opt.label}
            </button>
          ))}
        </div>

        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{flex:1}}>
            {saving ? <><span className="spinner"/>&nbsp;Saving...</> : "Save check-in →"}
          </button>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── ADD GOAL MODAL ─────────────────────────────────────────────────────────────

function AddGoalModal({ profiles, selectedProfile, learningPlans, onSave, onClose }) {
  const [form, setForm] = useState({
    text:"", goalType:"qualitative", category:"growth",
    archetypeAlignment:"", dueDate:"", reviewFrequency:"monthly",
    metricName:"", metricUnit:"", baselineValue:"", targetValue:"", measurementMethod:"",
    successIndicators:["","",""], evidenceRequired:"", linkedLearningPlanId:"", notes:"",
  });
  const [saving, setSaving] = useState(false);
  const f = (key,val) => setForm(prev=>({...prev,[key]:val}));

  const isQuant  = form.goalType === "quantitative";
  const isQual   = form.goalType === "qualitative" || form.goalType === "behavioural";

  async function save() {
    if (!form.text.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        successIndicators: form.successIndicators.filter(s=>s.trim()),
        baselineValue: form.baselineValue ? Number(form.baselineValue) : undefined,
        targetValue:   form.targetValue   ? Number(form.targetValue)   : undefined,
      };
      await onSave(body);
      onClose();
    } catch(e) { alert(e.message); } finally { setSaving(false); }
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,
        padding:28,width:"min(640px,96vw)",maxHeight:"90vh",overflowY:"auto"}}>

        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:"var(--gold)",fontWeight:700,textTransform:"uppercase",
            letterSpacing:".08em",marginBottom:6}}>Add Measurable Goal</div>
          <div style={{fontSize:11,color:"var(--soft)"}}>
            Every goal has a type, a category, and a method of proof. You define how success will be measured before you start.
          </div>
        </div>

        {/* Goal type selector */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:600,color:"var(--soft)",marginBottom:8}}>Goal type</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            {GOAL_TYPES.map(t=>(
              <button key={t.id} onClick={()=>f("goalType",t.id)}
                style={{padding:"10px 12px",borderRadius:10,border:`1px solid ${form.goalType===t.id?t.color:"var(--border)"}`,
                  background:form.goalType===t.id?`${t.color}15`:"transparent",
                  cursor:"pointer",textAlign:"left",transition:"all .15s"}}>
                <div style={{fontSize:13,marginBottom:3}}>{t.icon}</div>
                <div style={{fontSize:11,fontWeight:600,color:form.goalType===t.id?t.color:"var(--body)"}}>
                  {t.label}
                </div>
                <div style={{fontSize:9,color:"var(--muted)",lineHeight:1.4}}>{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Goal text */}
        <div className="field">
          <label className="field-label">Goal statement *</label>
          <textarea className="field-textarea" style={{minHeight:60}}
            value={form.text} onChange={e=>f("text",e.target.value)}
            placeholder={
              isQuant ? "e.g. Increase sprint delivery rate from 72% to 90% over 90 days"
              : "e.g. Demonstrate coaching presence in monthly team sessions without reverting to directive feedback"}/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:4}}>
          {/* Category */}
          <div className="field">
            <label className="field-label">Category</label>
            <select className="field-select" value={form.category} onChange={e=>f("category",e.target.value)}>
              {CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          {/* Archetype alignment */}
          <div className="field">
            <label className="field-label">Strength alignment</label>
            <select className="field-select" value={form.archetypeAlignment} onChange={e=>f("archetypeAlignment",e.target.value)}>
              <option value="">— select archetype —</option>
              {Object.entries(ARCH_ICONS).map(([id,icon])=>(
                <option key={id} value={id}>{icon} {id.charAt(0).toUpperCase()+id.slice(1)}</option>
              ))}
            </select>
          </div>
          {/* Due date */}
          <div className="field">
            <label className="field-label">Due date</label>
            <input className="field-input" type="date" value={form.dueDate} onChange={e=>f("dueDate",e.target.value)}/>
          </div>
          {/* Review frequency */}
          <div className="field">
            <label className="field-label">Check-in frequency</label>
            <select className="field-select" value={form.reviewFrequency} onChange={e=>f("reviewFrequency",e.target.value)}>
              {REVIEW_FREQ.map(r=><option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {/* Quantitative fields */}
        {isQuant && (
          <div style={{background:"rgba(91,141,239,.06)",border:"1px solid rgba(91,141,239,.2)",
            borderRadius:10,padding:"14px 16px",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:700,color:"var(--sapphire)",marginBottom:10,
              textTransform:"uppercase",letterSpacing:".06em"}}>📊 Quantitative Measurement</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div className="field">
                <label className="field-label">Metric name</label>
                <input className="field-input" value={form.metricName} onChange={e=>f("metricName",e.target.value)}
                  placeholder="e.g. Sprint delivery rate"/>
              </div>
              <div className="field">
                <label className="field-label">Unit</label>
                <input className="field-input" value={form.metricUnit} onChange={e=>f("metricUnit",e.target.value)}
                  placeholder="e.g. % , points, hrs/week"/>
              </div>
              <div className="field">
                <label className="field-label">Baseline (where you start)</label>
                <input className="field-input" type="number" value={form.baselineValue}
                  onChange={e=>f("baselineValue",e.target.value)} placeholder="e.g. 72"/>
              </div>
              <div className="field">
                <label className="field-label">Target (where you need to reach)</label>
                <input className="field-input" type="number" value={form.targetValue}
                  onChange={e=>f("targetValue",e.target.value)} placeholder="e.g. 90"/>
              </div>
            </div>
            <div className="field">
              <label className="field-label">How will it be measured?</label>
              <input className="field-input" value={form.measurementMethod} onChange={e=>f("measurementMethod",e.target.value)}
                placeholder="e.g. Sprint retrospective data from Jira, reviewed monthly with manager"/>
            </div>
          </div>
        )}

        {/* Qualitative / behavioural fields */}
        {isQual && (
          <div style={{background:"rgba(61,170,122,.06)",border:"1px solid rgba(61,170,122,.2)",
            borderRadius:10,padding:"14px 16px",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:700,color:"var(--emerald)",marginBottom:10,
              textTransform:"uppercase",letterSpacing:".06em"}}>✓ Observable Success Indicators</div>
            <div style={{fontSize:11,color:"var(--soft)",marginBottom:10}}>
              What would someone see, hear, or read that proves this goal is achieved?
            </div>
            {form.successIndicators.map((ind,i)=>(
              <div className="field" key={i} style={{marginBottom:8}}>
                <input className="field-input"
                  value={ind} placeholder={`Indicator ${i+1}: e.g. Delivers feedback without being asked in 3 of 4 weekly team meetings`}
                  onChange={e=>{const s=[...form.successIndicators];s[i]=e.target.value;f("successIndicators",s);}}/>
              </div>
            ))}
            <div className="field">
              <label className="field-label">Evidence required to mark complete</label>
              <input className="field-input" value={form.evidenceRequired} onChange={e=>f("evidenceRequired",e.target.value)}
                placeholder="e.g. 360 feedback score ≥ 4/5 on coaching, or manager sign-off in quarterly review"/>
            </div>
          </div>
        )}

        {/* Link to learning plan */}
        {learningPlans?.length > 0 && (
          <div className="field">
            <label className="field-label">Link to learning plan (optional)</label>
            <select className="field-select" value={form.linkedLearningPlanId}
              onChange={e=>f("linkedLearningPlanId",e.target.value)}>
              <option value="">— not linked to learning plan —</option>
              {learningPlans.map(p=>(
                <option key={p.id} value={p.id}>
                  {p.target_role} · {p.modules?.length||0} modules
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label className="field-label">Notes (optional)</label>
          <textarea className="field-textarea" style={{minHeight:50}}
            value={form.notes} onChange={e=>f("notes",e.target.value)}
            placeholder="Context, constraints, or anything the manager should know..."/>
        </div>

        <div style={{display:"flex",gap:10,marginTop:4}}>
          <button className="btn btn-primary" onClick={save} disabled={saving||!form.text.trim()} style={{flex:1}}>
            {saving ? <><span className="spinner"/>&nbsp;Creating...</> : "Create goal →"}
          </button>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── SUMMARY SECTION ────────────────────────────────────────────────────────────

function PerformanceSummary({ summary }) {
  if (!summary) return null;
  const { summary:s, byType, byCategory, strengthAlignment } = summary;
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
        {[
          {val:s.totalGoals,       label:"Total goals",         trend:""},
          {val:`${s.completionRate}%`, label:"Completion rate", trend:s.completionRate>=50?"↑ On track":"↓ Below 50%",  trendColor:s.completionRate>=50?"var(--emerald)":"var(--ruby)"},
          {val:`${s.avgActiveProgress}%`,label:"Avg progress", trend:"Active goals",trendColor:"var(--gold)"},
          {val:s.overdueGoals,      label:"Overdue goals",      trend:s.overdueGoals>0?"Needs attention":"All on time",trendColor:s.overdueGoals>0?"var(--ruby)":"var(--emerald)"},
        ].map((st,i)=>(
          <div key={i} style={{background:"var(--deep)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px"}}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,fontWeight:700,color:"var(--bright)",lineHeight:1}}>{st.val}</div>
            <div style={{fontSize:10,color:"var(--muted)",marginTop:3}}>{st.label}</div>
            {st.trend && <div style={{fontSize:10,color:st.trendColor||"var(--emerald)",marginTop:4,fontWeight:600}}>{st.trend}</div>}
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        {/* By type */}
        <div className="card" style={{marginBottom:0}}>
          <div className="card-title">By goal type</div>
          {Object.entries(byType).map(([type, data])=>(
            <div key={type} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:11}}>
                <span style={{color:"var(--soft)"}}>{GOAL_TYPES.find(t=>t.id===type)?.icon||"◇"} {type}</span>
                <span style={{color:TYPE_COLOR[type]||"var(--gold)",fontWeight:600}}>{data.completion_rate}%</span>
              </div>
              <div style={{height:5,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${data.avg_progress}%`,background:TYPE_COLOR[type]||"var(--gold)",borderRadius:3,transition:"width .9s ease"}}/>
              </div>
              <div style={{fontSize:9,color:"var(--muted)",marginTop:3}}>{data.completed}/{data.total} completed · {data.avg_progress}% avg progress</div>
            </div>
          ))}
        </div>

        {/* Strength alignment */}
        <div className="card" style={{marginBottom:0}}>
          <div className="card-title">Strength signal from check-ins</div>
          {strengthAlignment.totalCheckIns > 0 ? (
            <>
              <div style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:11}}>
                  <span style={{color:"var(--soft)"}}>🌱 Primary stone helped</span>
                  <span style={{color:"var(--emerald)",fontWeight:600}}>{strengthAlignment.helpRate}%</span>
                </div>
                <div style={{height:5,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${strengthAlignment.helpRate}%`,background:"var(--emerald)",borderRadius:3}}/>
                </div>
              </div>
              <div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:11}}>
                  <span style={{color:"var(--soft)"}}>⚠ Gap showed up</span>
                  <span style={{color:"var(--ruby)",fontWeight:600}}>{strengthAlignment.blockRate}%</span>
                </div>
                <div style={{height:5,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${strengthAlignment.blockRate}%`,background:"var(--ruby)",borderRadius:3}}/>
                </div>
              </div>
              <div style={{fontSize:10,color:"var(--muted)",marginTop:10}}>{strengthAlignment.totalCheckIns} check-ins recorded</div>
            </>
          ) : (
            <div style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:"16px 0"}}>
              Check-in data will appear here after first check-in
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────

export default function Performance({ onNavigate }) {
  const [profiles,      setProfiles]      = useState([]);
  const [selected,      setSelected]      = useState("");
  const [goals,         setGoals]         = useState([]);
  const [summary,       setSummary]       = useState(null);
  const [learningPlans, setLearningPlans] = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [tab,           setTab]           = useState("goals");
  const [filter,        setFilter]        = useState("all");
  const [expandedGoal,  setExpandedGoal]  = useState(null);
  const [showAdd,       setShowAdd]       = useState(false);
  const [checkingIn,    setCheckingIn]    = useState(null);
  const [error,         setError]         = useState("");

  // Load profiles on mount
  useEffect(() => {
    api.listProfiles()
      .then(r => { setProfiles(r.data); if(r.data.length) setSelected(r.data[0].id); })
      .catch(()=>{});
  }, []);

  // Load goals + summary when profile changes
  const loadProfile = useCallback(async (pid) => {
    if (!pid) return;
    setLoading(true); setError("");
    try {
      const [goalsRes, summaryRes, plansRes] = await Promise.allSettled([
        performanceApi.getGoals(pid),
        performanceApi.getSummary(pid),
        api.getProfilePlans ? api.getProfilePlans(pid) : Promise.resolve({data:[]}),
      ]);
      if (goalsRes.status === "fulfilled")   setGoals(goalsRes.value.data);
      if (summaryRes.status === "fulfilled") setSummary(summaryRes.value.data);
      if (plansRes.status === "fulfilled")   setLearningPlans(plansRes.value.data || []);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if(selected) loadProfile(selected); }, [selected, loadProfile]);

  // Actions
  async function handleAddGoal(body) {
    const res = await performanceApi.createGoal(selected, body);
    setGoals(prev => [res.data, ...prev]);
    await loadProfile(selected);
  }

  async function handleToggle(goalId, isDone) {
    let evidence = "";
    if (!isDone) {
      evidence = window.prompt("How did you prove this goal is complete? (optional — press OK to skip)") || "";
    }
    const res = await performanceApi.toggleGoal(goalId, { completionEvidence: evidence });
    setGoals(prev => prev.map(g => g.id === goalId ? res.data : g));
    await loadProfile(selected);
  }

  async function handleCheckIn(goalId, body) {
    const res = await performanceApi.checkIn(goalId, body);
    setGoals(prev => prev.map(g => g.id === goalId ? res.data.goal : g));
    await loadProfile(selected);
  }

  // Filter goals
  const filtered = goals.filter(g => {
    if (filter === "active")       return !g.done;
    if (filter === "done")         return g.done;
    if (filter === "overdue")      return g.isOverdue && !g.done;
    if (filter === "quantitative") return g.goal_type === "quantitative";
    if (filter === "qualitative")  return g.goal_type === "qualitative" || g.goal_type === "behavioural";
    if (filter === "learning")     return g.goal_type === "learning";
    return true;
  });

  const currentProfile = profiles.find(p => p.id === selected);

  return (
    <div className="page">
      <div className="eyebrow">Develop</div>
      <div className="page-title">Performance Engine</div>
      <div className="page-subtitle">
        Measurable outcomes for every goal — quantitative metrics, qualitative indicators, and a check-in trail that proves growth is real.
      </div>

      {/* IO Box */}
      <div className="io-box">
        <div className="io-zone" style={{background:"rgba(61,170,122,.08)",border:"1px solid rgba(61,170,122,.3)"}}>
          <div className="io-zone-label" style={{color:"var(--emerald)"}}>What you put in</div>
          <div className="io-zone-item" style={{color:"var(--emerald)"}}>
            · A strength profile (primary stone)<br/>
            · Goals with type: quantitative, qualitative, behavioural, or learning<br/>
            · Baseline + target for quantitative goals<br/>
            · Observable indicators for qualitative goals<br/>
            · Regular check-ins with evidence
          </div>
        </div>
        <div className="io-zone" style={{background:"rgba(212,168,67,.08)",border:"1px solid rgba(212,168,67,.3)"}}>
          <div className="io-zone-label" style={{color:"var(--gold)"}}>What you get out</div>
          <div className="io-zone-item" style={{color:"var(--gold)"}}>
            · Progress tracked from baseline to target<br/>
            · Completion rate by goal type and category<br/>
            · Strength alignment signal: how often primary stone helps<br/>
            · Evidence trail for manager review and promotion cases<br/>
            · 90-day growth trajectory
          </div>
        </div>
      </div>

      {/* Profile selector */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,gap:10}}>
        <select className="field-select" style={{flex:1,maxWidth:360}} value={selected}
          onChange={e => setSelected(e.target.value)}>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
        </select>
        {currentProfile && (
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,color:"var(--soft)"}}>Primary stone:</span>
            <span style={{fontSize:11,fontWeight:600,color:ARCH_COLORS[currentProfile.primary]||"var(--gold)"}}>
              {ARCH_ICONS[currentProfile.primary]||"◇"} {currentProfile.primary}
            </span>
          </div>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add goal</button>
      </div>

      {error && <div className="notice notice-error" style={{marginBottom:12}}>⚠ {error}</div>}

      {loading ? (
        <div className="loading-center"><div className="spinner"/><span>Loading performance data...</span></div>
      ) : (
        <>
          {/* Tabs */}
          <div className="tab-bar">
            <button className={`tab-btn${tab==="goals"?" active":""}`} onClick={()=>setTab("goals")}>
              Goals ({goals.length})
            </button>
            <button className={`tab-btn${tab==="summary"?" active":""}`} onClick={()=>setTab("summary")}>
              Summary
            </button>
          </div>

          {tab === "summary" && <PerformanceSummary summary={summary}/>}

          {tab === "goals" && (
            <>
              {/* Filter row */}
              <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
                {[
                  {id:"all",          label:`All (${goals.length})`},
                  {id:"active",       label:`Active (${goals.filter(g=>!g.done).length})`},
                  {id:"done",         label:`Done (${goals.filter(g=>g.done).length})`},
                  {id:"overdue",      label:`Overdue (${goals.filter(g=>g.isOverdue&&!g.done).length})`},
                  {id:"quantitative", label:"Quantitative"},
                  {id:"qualitative",  label:"Qualitative"},
                  {id:"learning",     label:"Learning"},
                ].map(f2=>(
                  <button key={f2.id} onClick={()=>setFilter(f2.id)}
                    style={{padding:"5px 12px",borderRadius:999,fontSize:10,fontWeight:600,
                      cursor:"pointer",border:`1px solid ${filter===f2.id?"var(--gold)":"var(--border)"}`,
                      background:filter===f2.id?"rgba(212,168,67,.1)":"transparent",
                      color:filter===f2.id?"var(--gold)":"var(--muted)",transition:"all .15s"}}>
                    {f2.label}
                  </button>
                ))}
              </div>

              {/* Goal list */}
              {filtered.length === 0 ? (
                <div className="card" style={{textAlign:"center",padding:"40px 20px"}}>
                  <div style={{fontSize:28,opacity:.3,marginBottom:10}}>◇</div>
                  <div style={{fontFamily:"var(--fd-serif,serif)",fontSize:17,color:"var(--bright)",marginBottom:6}}>
                    {goals.length===0 ? "No goals yet" : "No goals match this filter"}
                  </div>
                  <div style={{fontSize:12,color:"var(--soft)",marginBottom:14}}>
                    {goals.length===0
                      ? "Add your first measurable goal. Every goal needs a type, a method of proof, and a baseline."
                      : "Try a different filter to see your goals."}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={()=>setShowAdd(true)}>
                    + Add first goal
                  </button>
                </div>
              ) : (
                filtered.map(goal => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    expanded={expandedGoal === goal.id}
                    onExpand={id => setExpandedGoal(expandedGoal===id ? null : id)}
                    onToggle={handleToggle}
                    onCheckIn={g => setCheckingIn(g)}
                  />
                ))
              )}
            </>
          )}
        </>
      )}

      {/* Modals */}
      {showAdd && (
        <AddGoalModal
          profiles={profiles}
          selectedProfile={selected}
          learningPlans={learningPlans}
          onSave={handleAddGoal}
          onClose={() => setShowAdd(false)}
        />
      )}
      {checkingIn && (
        <CheckInModal
          goal={checkingIn}
          onSave={handleCheckIn}
          onClose={() => setCheckingIn(null)}
        />
      )}
    </div>
  );
}
