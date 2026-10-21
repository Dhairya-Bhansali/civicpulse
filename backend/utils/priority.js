const pool = require('../db');

const DEFAULT_SETTINGS = {
  duplicate_radius_m: 100, // geographic window for duplicates
  jaccard_threshold: 0.3,  // minimum text similarity for duplicates
  w_severity: 10,          // points per severity-weight unit of the category
  w_confirmations: 4,      // points per community confirmation
  w_age: 1.5,              // points per day the issue has stayed open
  age_cap_days: 60,        // age stops adding points after this many days
};

async function getSettings() {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM settings');
  const out = { ...DEFAULT_SETTINGS };
  rows.forEach((r) => {
    out[r.setting_key] = Number(r.setting_value);
  });
  return out;
}

/**
 * Dynamic priority score:
 *   score = w_sev · categorySeverity + w_conf · confirmations + w_age · min(ageDays, cap)
 * Closed issues (Resolved / Rejected) drop to 0 so they leave the queue.
 */
function computePriority(issue, settings, now = Date.now()) {
  const ageDays = Math.max(0, (now - new Date(issue.created_at).getTime()) / 86400000);
  const severityPts = Number(issue.severity_weight) * settings.w_severity;
  const confirmationPts = Number(issue.confirmations) * settings.w_confirmations;
  const agePts = Math.min(ageDays, settings.age_cap_days) * settings.w_age;
  const closed = issue.status === 'Resolved' || issue.status === 'Rejected';
  const score = closed ? 0 : severityPts + confirmationPts + agePts;
  return {
    priority_score: Math.round(score * 10) / 10,
    priority_level: closed ? 'Closed' : priorityLevel(score),
    age_days: Math.round(ageDays * 10) / 10,
    breakdown: {
      severity: Math.round(severityPts * 10) / 10,
      confirmations: Math.round(confirmationPts * 10) / 10,
      age: Math.round(agePts * 10) / 10,
    },
  };
}

function priorityLevel(score) {
  if (score >= 100) return 'Critical';
  if (score >= 70) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
}

module.exports = { getSettings, computePriority, priorityLevel, DEFAULT_SETTINGS };
