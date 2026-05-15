import React, { useState, useEffect } from "react";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Assessment from "./pages/Assessment";
import { Profiles, GapAnalysis } from "./pages/Profiles";
import Performance from "./pages/Performance";
import Outcomes from "./pages/Outcomes";
import LMS from "./pages/LMS";
import DataCentre from "./pages/DataCentre";
import "./App.css";
import { api } from "./utils/api";

const NAV = [
  { id:"dashboard",  icon:"◈", label:"Dashboard",          section:"Overview"   },
  { id:"assessment", icon:"◇", label:"Strength Assessment", section:"Discover"   },
  { id:"profiles",   icon:"◉", label:"Intelligence Profiles",section:"Discover"  },
  { id:"gap",        icon:"⊘", label:"Gap Analysis",        section:"Develop"    },
  { id:"lms",        icon:"◑", label:"Learning Engine",     section:"Develop"    },
  { id:"performance",icon:"▲", label:"Performance Engine",  section:"Develop"    },
  { id:"outcomes",   icon:"◎", label:"Outcome Tracking",    section:"Validation" },
  { id:"datacentre", icon:"◈", label:"Data Intelligence",   section:"Validation" },
  { id:"reports",    icon:"▤", label:"Reports",             section:"Management" },
];

export default function App() {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(null);
  const [page,    setPage]    = useState("dashboard");
  const [loading, setLoading] = useState(true);

  // Restore session on load
  useEffect(() => {
    const savedToken = localStorage.getItem("si_access_token");
    const savedUser  = localStorage.getItem("si_user");
    if (savedToken && savedUser) {
      // Validate token still works
      api.me().then(json => {
        if (json?.data) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        } else {
          // Token expired — try refresh handled by api helper
        }
      }).catch(() => {})
      .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  function handleAuth(newUser, newToken) {
    setUser(newUser); setToken(newToken); setPage("dashboard");
  }

  function handleLogout() {
    // Call logout endpoint, but don't wait for response
    api.logout().catch(() => {});
    // Clear local session
    localStorage.removeItem("si_access_token");
    localStorage.removeItem("si_refresh_token");
    localStorage.removeItem("si_user");
    setUser(null); setToken(null);
  }

  if (loading) {
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center",
        justifyContent:"center", background:"#0D1117", color:"#7A8FA8", fontFamily:"DM Sans,sans-serif" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ width:44, height:44, background:"linear-gradient(135deg,#8A6820,#D4A843)",
            borderRadius:10, margin:"0 auto 14px", display:"flex", alignItems:"center",
            justifyContent:"center", fontFamily:"Georgia,serif", fontSize:18, fontWeight:700, color:"#0D1117" }}>
            SI
          </div>
          <div style={{ fontSize:12 }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) return <Auth onAuth={handleAuth}/>;

  const sections = [...new Set(NAV.map(n => n.section))];

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <div className="brand-gem">SI</div>
          <div>
            <div className="brand-name">Strength Intelligence</div>
            <div className="brand-tag">SI Platform · v2.0</div>
          </div>
        </div>

        {sections.map(section => (
          <div key={section} className="nav-section">
            <div className="nav-section-label">{section}</div>
            {NAV.filter(n => n.section === section).map(item => (
              <button key={item.id}
                className={`nav-item${page === item.id ? " active" : ""}`}
                onClick={() => setPage(item.id)}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        ))}

        {/* User session */}
        <div style={{ marginTop:"auto", padding:"14px 12px",
          borderTop:"1px solid var(--border)" }}>
          <div style={{ fontSize:10, color:"var(--muted)", marginBottom:4 }}>SIGNED IN AS</div>
          <div style={{ fontSize:11, fontWeight:600, color:"var(--body)", marginBottom:2 }}>{user.name}</div>
          <div style={{ fontSize:10, color:"var(--muted)", marginBottom:8 }}>
            {user.role} · {user.orgName || "Organisation"}
          </div>
          <button onClick={handleLogout}
            style={{ fontSize:10, color:"var(--muted)", background:"none", border:"1px solid var(--border)",
              borderRadius:6, padding:"4px 10px", cursor:"pointer", fontFamily:"inherit",
              transition:"all .15s", width:"100%" }}
            onMouseEnter={e => { e.target.style.color="var(--ruby)"; e.target.style.borderColor="var(--ruby)"; }}
            onMouseLeave={e => { e.target.style.color="var(--muted)"; e.target.style.borderColor="var(--border)"; }}>
            Sign out
          </button>
        </div>
      </nav>

      <main className="main">
        {page==="dashboard"   && <Dashboard    onNavigate={setPage} token={token}/>}
        {page==="assessment"  && <Assessment   onNavigate={setPage} token={token}/>}
        {page==="profiles"    && <Profiles     onNavigate={setPage} token={token}/>}
        {page==="gap"         && <GapAnalysis  onNavigate={setPage} token={token}/>}
        {page==="lms"         && <LMS          onNavigate={setPage} token={token}/>}
        {page==="performance" && <Performance  onNavigate={setPage} token={token}/>}
        {page==="outcomes"    && <Outcomes     onNavigate={setPage} token={token}/>}
        {page==="datacentre"  && <DataCentre   onNavigate={setPage} token={token}/>}
        {page==="reports"     && <DataCentre   onNavigate={setPage} token={token} reportsMode={true}/>}
      </main>
    </div>
  );
}
