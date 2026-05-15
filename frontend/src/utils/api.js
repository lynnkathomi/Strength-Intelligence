const BASE = process.env.REACT_APP_API_URL
  || (process.env.NODE_ENV === "development" ? "http://localhost:5000/api" : "https://strength-intelligence.onrender.com/api");

if (!process.env.REACT_APP_API_URL && process.env.NODE_ENV !== "development") {
  console.warn("REACT_APP_API_URL is not set. Falling back to the Render backend URL.");
}

function getToken() {
  return localStorage.getItem("si_access_token") || "";
}

export async function post(path, body, opts = {}) {
  return req(path, { method: "POST", body: JSON.stringify(body), ...opts });
}

async function req(path, opts = {}) {
  if (!BASE) {
    throw new Error("API base URL is not set. Set REACT_APP_API_URL in your Vercel environment.");
  }
  const token = getToken();
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts.headers,
      },
      ...opts,
    });

  if (res.status === 401) {
    const errJson = await res.json().catch(() => ({}));
    if (errJson.code === "TOKEN_EXPIRED") {
      const refreshToken = localStorage.getItem("si_refresh_token");
      if (refreshToken) {
        try {
          const r2 = await fetch(`${BASE}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          });
          if (r2.ok) {
            const r2json = await r2.json();
            const newToken = r2json?.data?.accessToken;
            if (newToken) {
              localStorage.setItem("si_access_token", newToken);
              const retry = await fetch(`${BASE}${path}`, {
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${newToken}`,
                  ...opts.headers,
                },
                ...opts,
              });
              const retryJson = await retry.json();
              if (!retry.ok) throw new Error(retryJson.error || `HTTP ${retry.status}`);
              return retryJson;
            }
          }
        } catch (_) {}
      }
    }
    throw new Error(errJson.error || "Authentication required");
  }

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Failed to reach ${BASE}. Check if the backend is running and CORS is enabled.`);
    }
    throw err;
  }
}

export const api = {
  getArchetypes:       () => req("/archetypes"),
  getQuestions:        () => req("/questions"),
  getEnergyActivities: () => req("/energy-activities"),
  getRoles:            () => req("/roles"),
  listProfiles:        ()     => req("/profiles"),
  createProfile:       (body) => req("/profiles", { method:"POST", body: JSON.stringify(body) }),
  getProfile:          (id)   => req(`/profiles/${id}`),
  createAssessment:      (body)      => req("/assessments", { method:"POST", body: JSON.stringify(body) }),
  completeAssessment:    (id, body)  => req(`/assessments/${id}/complete`, { method:"PUT", body: JSON.stringify(body) }),
  getAssessment:         (id)        => req(`/assessments/${id}`),
  getProfileAssessments: (profileId) => req(`/profiles/${profileId}/assessments`),
  getTrajectory:  (profileId) => req(`/profiles/${profileId}/trajectory`),
  getReport:      (profileId) => req(`/profiles/${profileId}/report`),
  runGapAnalysis: (body)      => req("/gap-analysis", { method:"POST", body: JSON.stringify(body) }),
  getDashboard:   () => req("/dashboard"),
  getGoals:       (profileId) => req(`/profiles/${profileId}/goals`),
  createGoal:     (profileId, body) => req(`/profiles/${profileId}/goals`, { method:"POST", body: JSON.stringify(body) }),
  toggleGoal:     (goalId)    => req(`/goals/${goalId}/toggle`, { method:"PATCH" }),
  recordOutcome:      (body) => req("/outcomes", { method:"POST", body: JSON.stringify(body) }),
  getOutcomesSummary: ()     => req("/outcomes/summary"),
  interpret: (body) => req("/ai/interpret", { method:"POST", body: JSON.stringify(body) }),
  me:             ()     => req("/auth/me"),
  listUsers:      ()     => req("/auth/users"),
  inviteUser:     (body) => req("/auth/users/invite", { method:"POST", body: JSON.stringify(body) }),
  changePassword: (body) => req("/auth/change-password", { method:"POST", body: JSON.stringify(body) }),
  logout:         ()     => req("/auth/logout", { method:"POST" }),
};

export const lmsApi = {
  createPlan:      (body)         => req("/learning/plans",                      { method:"POST", body: JSON.stringify(body) }),
  getPlan:         (planId)       => req(`/learning/plans/${planId}`),
  getProfilePlans: (profileId)    => req(`/learning/plans/profile/${profileId}`),
  updateProgress:  (modId, body)  => req(`/learning/modules/${modId}/progress`,  { method:"PATCH", body: JSON.stringify(body) }),
  aiSession:       (body)         => req("/learning/sessions/ai",                { method:"POST", body: JSON.stringify(body) }),
  weeklyReview:    (body)         => req("/learning/weekly-review",              { method:"POST", body: JSON.stringify(body) }),
  getCatalogue:    ()             => req("/learning/catalogue"),
};

export const performanceApi = {
  getGoals:    (profileId)       => req(`/profiles/${profileId}/goals`),
  createGoal:  (profileId, body) => req(`/profiles/${profileId}/goals`,  { method:"POST",  body: JSON.stringify(body) }),
  updateGoal:  (profileId, body) => req(`/profiles/${profileId}/goals`,  { method:"PUT",   body: JSON.stringify(body) }),
  toggleGoal:  (goalId, body)    => req(`/goals/${goalId}/toggle`,       { method:"PATCH", body: JSON.stringify(body || {}) }),
  checkIn:     (goalId, body)    => req(`/goals/${goalId}/checkin`,      { method:"POST",  body: JSON.stringify(body) }),
  getCheckIns: (goalId)          => req(`/goals/${goalId}/checkins`),
  getSummary:  (profileId)       => req(`/profiles/${profileId}/performance-summary`),
};

export const dataApi = {
  health:          () => req("/data-centre/health"),
  validation:      () => req("/data-centre/validation"),
  benchmarks:      () => req("/data-centre/benchmarks"),
  modelImprovement:() => req("/data-centre/model-improvement"),
  export:          (includeNames = false) => req(`/data-centre/export?include_names=${includeNames}`),
};
