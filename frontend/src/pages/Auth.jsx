import React, { useState } from "react";
import { api, post } from "../utils/api";

// ── Forced password change screen ─────────────────────────────────────────────
function ChangePasswordPrompt({ user, token, onDone }) {
  const [form,    setForm]    = useState({ current: "SI2026Launch!", newPw: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [strength, setStrength] = useState(0);

  const f = (k) => (e) => {
    const val = e.target.value;
    setForm(p => ({ ...p, [k]: val }));
    if (k === "newPw") {
      let s = 0;
      if (val.length >= 8)  s++;
      if (val.length >= 12) s++;
      if (/[A-Z]/.test(val)) s++;
      if (/[0-9]/.test(val)) s++;
      if (/[^A-Za-z0-9]/.test(val)) s++;
      setStrength(s);
    }
  };

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong", "Very strong"][strength];
  const strengthColor = ["", "#E05060", "#F0A040", "#D4A843", "#3DAA7A", "#3DAA7A"][strength];

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (form.newPw.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (form.newPw !== form.confirm) { setError("Passwords don't match"); return; }
    if (form.newPw === "SI2026Launch!") { setError("Please choose a new password — don't reuse the shared one"); return; }
    setLoading(true);
    try {
      await api.changePassword({ currentPassword: form.current, newPassword: form.newPw });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "var(--midnight)", display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "var(--ff)",
    }}>
      <div style={{ position: "fixed", inset: 0, backgroundImage: "radial-gradient(circle at 30% 60%, rgba(212,168,67,.05) 0%, transparent 50%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", width: "min(440px,94vw)" }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, margin: "0 auto 14px",
            background: "linear-gradient(135deg,#8A6820,#D4A843)",
            borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 700, color: "#1C2333",
            boxShadow: "0 0 28px rgba(212,168,67,.25)",
          }}>SI</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 700, color: "#EEF4FF", marginBottom: 6 }}>
            Welcome, {user.name.split(" ")[0]}
          </div>
          <div style={{ fontSize: 12, color: "#7A8FA8", maxWidth: 320, margin: "0 auto", lineHeight: 1.5 }}>
            You're signing in for the first time. Please set your own private password before continuing.
          </div>
        </div>

        {/* Banner */}
        <div style={{
          background: "rgba(212,168,67,.08)", border: "1px solid rgba(212,168,67,.25)",
          borderRadius: 10, padding: "12px 16px", marginBottom: 20,
          display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>🔒</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#D4A843", marginBottom: 2 }}>Security step required</div>
            <div style={{ fontSize: 11, color: "#8A9BB0", lineHeight: 1.5 }}>
              The shared launch password <strong style={{ color: "#C8D8E8" }}>SI2026Launch!</strong> is known to your team admin. Set a private password only you know.
            </div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "#2A3650", border: "1px solid #243040",
          borderRadius: 16, padding: "28px 28px 24px",
          boxShadow: "0 8px 40px rgba(0,0,0,.4)",
        }}>
          {error && (
            <div style={{
              background: "rgba(224,80,96,.1)", border: "1px solid rgba(224,80,96,.3)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              fontSize: 12, color: "#E05060",
            }}>⚠ {error}</div>
          )}

          <form onSubmit={submit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#7A8FA8", display: "block", marginBottom: 5 }}>
                New password *
              </label>
              <input
                required type="password" value={form.newPw} onChange={f("newPw")}
                placeholder="Choose something only you know"
                minLength={8}
                style={{
                  width: "100%", padding: "10px 13px", borderRadius: 9,
                  border: "1px solid #3A4A62", background: "#1C2333", fontFamily: "inherit",
                  fontSize: 13, color: "#C8D8E8", outline: "none", boxSizing: "border-box",
                }}
                onFocus={e => e.target.style.borderColor = "#D4A843"}
                onBlur={e => e.target.style.borderColor = "#3A4A62"}
              />
              {form.newPw && (
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 3, borderRadius: 2, background: "#1C2333", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(strength / 5) * 100}%`, background: strengthColor, transition: "width .3s, background .3s" }} />
                  </div>
                  <span style={{ fontSize: 10, color: strengthColor, minWidth: 60 }}>{strengthLabel}</span>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#7A8FA8", display: "block", marginBottom: 5 }}>
                Confirm new password *
              </label>
              <input
                required type="password" value={form.confirm} onChange={f("confirm")}
                placeholder="Repeat your new password"
                minLength={8}
                style={{
                  width: "100%", padding: "10px 13px", borderRadius: 9,
                  border: `1px solid ${form.confirm && form.confirm !== form.newPw ? "#E05060" : "#3A4A62"}`,
                  background: "#1C2333", fontFamily: "inherit",
                  fontSize: 13, color: "#C8D8E8", outline: "none", boxSizing: "border-box",
                }}
                onFocus={e => e.target.style.borderColor = "#D4A843"}
                onBlur={e => e.target.style.borderColor = form.confirm && form.confirm !== form.newPw ? "#E05060" : "#3A4A62"}
              />
              {form.confirm && form.confirm !== form.newPw && (
                <div style={{ fontSize: 10, color: "#E05060", marginTop: 4 }}>Passwords don't match</div>
              )}
            </div>

            <button
              type="submit" disabled={loading || form.newPw !== form.confirm || form.newPw.length < 8}
              style={{
                width: "100%", padding: "11px", borderRadius: 9, border: "none",
                background: (loading || form.newPw !== form.confirm || form.newPw.length < 8)
                  ? "rgba(212,168,67,.35)"
                  : "linear-gradient(135deg,#D4A843,#F0C060)",
                color: "#1C2333", fontFamily: "inherit", fontSize: 13, fontWeight: 700,
                cursor: (loading || form.newPw !== form.confirm || form.newPw.length < 8) ? "not-allowed" : "pointer",
                transition: "all .15s",
              }}
            >
              {loading ? "Setting password..." : "Set my password & continue →"}
            </button>
          </form>
        </div>

        <div style={{ textAlign: "center", marginTop: 14, fontSize: 10, color: "#3D4F68" }}>
          🔒 Your password is hashed with bcrypt — not even admins can read it
        </div>
      </div>
    </div>
  );
}

// ── Main Auth screen ───────────────────────────────────────────────────────────
export default function Auth({ onAuth }) {
  const [mode,             setMode]             = useState("login");
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState("");
  const [form,             setForm]             = useState({ email: "", password: "", name: "", orgName: "" });
  // Held here while forced password change is pending
  const [pendingUser,      setPendingUser]      = useState(null);
  const [pendingToken,     setPendingToken]     = useState(null);

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const payload  = mode === "login"
        ? { email: form.email, password: form.password }
        : { email: form.email, password: form.password, name: form.name, orgName: form.orgName };

      const res  = await post(endpoint, payload);
      const data = res.data;

      localStorage.setItem("si_access_token",  data.accessToken);
      localStorage.setItem("si_refresh_token", data.refreshToken);
      localStorage.setItem("si_user",          JSON.stringify(data.user));

      // Check if forced password change is required
      if (data.mustChangePassword || data.user?.mustChangePassword) {
        setPendingUser(data.user);
        setPendingToken(data.accessToken);
      } else {
        onAuth(data.user, data.accessToken);
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(err.message || "Failed to reach the server. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  // Show forced change screen if needed
  if (pendingUser && pendingToken) {
    return (
      <ChangePasswordPrompt
        user={pendingUser}
        token={pendingToken}
        onDone={() => {
          // After change, update user in storage and proceed
          const updatedUser = { ...pendingUser, mustChangePassword: false };
          localStorage.setItem("si_user", JSON.stringify(updatedUser));
          onAuth(updatedUser, pendingToken);
        }}
      />
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: "var(--midnight)", display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "var(--ff)",
    }}>
      <div style={{ position: "fixed", inset: 0, backgroundImage: "radial-gradient(circle at 20% 50%, rgba(212,168,67,.04) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(91,141,239,.04) 0%, transparent 50%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", width: "min(420px,94vw)" }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, margin: "0 auto 14px",
            background: "linear-gradient(135deg,#8A6820,#D4A843)",
            borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 700, color: "#1C2333",
            boxShadow: "0 0 28px rgba(212,168,67,.25)",
          }}>SI</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 26, fontWeight: 700, color: "#EEF4FF", marginBottom: 4 }}>
            Strength Intelligence
          </div>
          <div style={{ fontSize: 12, color: "#7A8FA8" }}>
            {mode === "login" ? "Sign in to your organisation" : "Create your organisation account"}
          </div>
        </div>

        {/* Shared credentials hint — login mode only */}
        {mode === "login" && (
          <div style={{
            background: "rgba(61,170,122,.06)", border: "1px solid rgba(61,170,122,.2)",
            borderRadius: 10, padding: "11px 14px", marginBottom: 16,
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>◆</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#3DAA7A", marginBottom: 3 }}>
                First time? Use the shared launch credentials
              </div>
              <div style={{ fontSize: 11, color: "#6A8A78", lineHeight: 1.55 }}>
                Email: <strong style={{ color: "#C8D8E8" }}>your email address</strong><br/>
                Password: <strong style={{ color: "#C8D8E8" }}>SI2026Launch!</strong><br/>
                You'll be asked to set your own password immediately after.
              </div>
            </div>
          </div>
        )}

        {/* Card */}
        <div style={{
          background: "#2A3650", border: "1px solid #243040",
          borderRadius: 16, padding: "32px 28px",
          boxShadow: "0 8px 40px rgba(0,0,0,.4)",
        }}>
          {error && (
            <div style={{
              background: "rgba(224,80,96,.1)", border: "1px solid rgba(224,80,96,.3)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              fontSize: 12, color: "#E05060",
            }}>⚠ {error}</div>
          )}

          <form onSubmit={submit}>
            {mode === "register" && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#7A8FA8", display: "block", marginBottom: 5 }}>
                    Your full name *
                  </label>
                  <input
                    required value={form.name} onChange={f("name")}
                    placeholder="e.g. Fatima Nkosi"
                    style={{ width: "100%", padding: "10px 13px", borderRadius: 9, border: "1px solid #243040", background: "#1C2333", fontFamily: "inherit", fontSize: 13, color: "#C8D8E8", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => e.target.style.borderColor = "#D4A843"}
                    onBlur={e => e.target.style.borderColor = "#3A4A62"}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#7A8FA8", display: "block", marginBottom: 5 }}>
                    Organisation name
                  </label>
                  <input
                    value={form.orgName} onChange={f("orgName")}
                    placeholder="e.g. Kilimanjaro Consulting"
                    style={{ width: "100%", padding: "10px 13px", borderRadius: 9, border: "1px solid #243040", background: "#1C2333", fontFamily: "inherit", fontSize: 13, color: "#C8D8E8", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => e.target.style.borderColor = "#D4A843"}
                    onBlur={e => e.target.style.borderColor = "#3A4A62"}
                  />
                </div>
              </>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#7A8FA8", display: "block", marginBottom: 5 }}>
                Email address *
              </label>
              <input
                required type="email" value={form.email} onChange={f("email")}
                placeholder="you@organisation.com"
                style={{ width: "100%", padding: "10px 13px", borderRadius: 9, border: "1px solid #243040", background: "#1C2333", fontFamily: "inherit", fontSize: 13, color: "#C8D8E8", outline: "none", boxSizing: "border-box" }}
                onFocus={e => e.target.style.borderColor = "#D4A843"}
                onBlur={e => e.target.style.borderColor = "#3A4A62"}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#7A8FA8", display: "block", marginBottom: 5 }}>
                Password * {mode === "register" && <span style={{ color: "#3D4F68" }}>(min 8 characters)</span>}
              </label>
              <input
                required type="password" value={form.password} onChange={f("password")}
                placeholder="••••••••"
                minLength={8}
                style={{ width: "100%", padding: "10px 13px", borderRadius: 9, border: "1px solid #243040", background: "#1C2333", fontFamily: "inherit", fontSize: 13, color: "#C8D8E8", outline: "none", boxSizing: "border-box" }}
                onFocus={e => e.target.style.borderColor = "#D4A843"}
                onBlur={e => e.target.style.borderColor = "#3A4A62"}
              />
            </div>

            <button
              type="submit" disabled={loading}
              style={{
                width: "100%", padding: "11px", borderRadius: 9, border: "none",
                background: loading ? "rgba(212,168,67,.5)" : "linear-gradient(135deg,#D4A843,#F0C060)",
                color: "#1C2333", fontFamily: "inherit", fontSize: 13, fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 2px 14px rgba(212,168,67,.25)",
                transition: "all .15s",
              }}
            >
              {loading
                ? (mode === "login" ? "Signing in..." : "Creating account...")
                : (mode === "login" ? "Sign in →" : "Create account & continue →")}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "#4A5568" }}>
            {mode === "login" ? (
              <>Don't have an account?{" "}
                <button onClick={() => { setMode("register"); setError(""); }}
                  style={{ background: "none", border: "none", color: "#D4A843", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}>
                  Create one free →
                </button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button onClick={() => { setMode("login"); setError(""); }}
                  style={{ background: "none", border: "none", color: "#D4A843", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}>
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "#3D4F68" }}>
          🔒 Passwords are hashed with bcrypt · JWT tokens expire in 8 hours · Data is yours
        </div>
      </div>
    </div>
  );
}
