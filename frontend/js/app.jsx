/* =====================================================================
   CivicPulse – React front end (Bootstrap 5 + Leaflet)
   Compiled in the browser by Babel, so no build step is required.
   ===================================================================== */
const { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } = React;

const STATUSES = ['Reported', 'Acknowledged', 'In Progress', 'Resolved', 'Rejected'];
const LEVEL_COLORS = { Critical: '#D64545', High: '#EA7A1F', Medium: '#D9A300', Low: '#2E9E5B', Closed: '#8A97A8' };
const ICON_CHOICES = [
  'bi-cone-striped', 'bi-lightbulb', 'bi-trash3', 'bi-droplet-half', 'bi-water', 'bi-tree',
  'bi-sign-stop', 'bi-exclamation-octagon', 'bi-exclamation-triangle', 'bi-tools',
  'bi-signpost-split', 'bi-lightning-charge', 'bi-bus-front', 'bi-fire', 'bi-bug', 'bi-houses',
];

/* ---------------- client-side copies of the engine (used by the admin lab) ---------------- */
const toRad = (d) => (d * Math.PI) / 180;
function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}
const STOP = new Set(['the', 'and', 'for', 'are', 'was', 'were', 'has', 'have', 'had', 'with', 'this', 'that', 'from', 'near', 'there', 'very', 'been', 'will', 'its', 'not', 'but', 'you', 'our', 'out', 'can', 'since', 'just', 'again', 'please', 'also', 'into', 'over', 'which', 'when', 'than', 'them', 'they']);
function tokenize(text) {
  return new Set(
    String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
  );
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((t) => { if (b.has(t)) inter++; });
  return inter / (a.size + b.size - inter);
}
function levelFor(score) { return score >= 100 ? 'Critical' : score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low'; }

/* ---------------- API + session helpers ---------------- */
async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = sessionStorage.getItem('cp_token');
  if (token) headers.Authorization = 'Bearer ' + token;
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    const err = new Error('Cannot reach the CivicPulse server.');
    err.status = 0;
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event('cp-logout'));
    const err = new Error((data && data.error) || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function getVoterKey() {
  let k = localStorage.getItem('cp_voter');
  if (!k) {
    k = 'v-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    localStorage.setItem('cp_voter', k);
  }
  return k;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const ageLabel = (days) => (days < 1 ? 'Today' : days < 2 ? '1 day' : `${Math.round(days)} days`);
const pct = (n) => `${Math.round(n * 100)}%`;

/* ---------------- toasts ---------------- */
const ToastCtx = createContext(() => {});
const useToast = () => useContext(ToastCtx);

/* ---------------- small shared UI ---------------- */
function LevelPill({ level }) {
  return <span className={`pill pill-${level}`}>{level}</span>;
}
function StatusPill({ status }) {
  return <span className={`pill status-${status.replace(/ /g, '-')}`}>{status}</span>;
}
function CategoryChip({ issue }) {
  return (
    <span className="cat-chip">
      <i className={`bi ${issue.category_icon}`} style={{ background: issue.category_color }}></i>
      {issue.category_name}
    </span>
  );
}
function ScoreBar({ score, level }) {
  return (
    <div className="d-flex align-items-center gap-2">
      <div className="score-track flex-grow-1">
        <div className="score-fill" style={{ width: `${Math.min(100, score / 1.6)}%`, background: LEVEL_COLORS[level] }}></div>
      </div>
      <strong style={{ minWidth: 38, color: 'var(--cp-ink)' }}>{score.toFixed(0)}</strong>
    </div>
  );
}
function PageHead({ title, subtitle, children }) {
  return (
    <div className="cp-page-head">
      <div className="container d-flex flex-wrap justify-content-between align-items-end gap-3">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="text-muted mb-0 mt-2" style={{ maxWidth: '62ch' }}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
function Empty({ icon = 'bi-inbox', title, text }) {
  return (
    <div className="empty">
      <i className={`bi ${icon}`}></i>
      <h3 className="h5 mt-2">{title}</h3>
      {text && <p className="mb-0">{text}</p>}
    </div>
  );
}

function Modal({ title, onClose, children, size = 'lg', footer }) {
  useEffect(() => {
    document.body.classList.add('modal-open');
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { document.body.classList.remove('modal-open'); window.removeEventListener('keydown', onKey); };
  }, []);
  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true"
           onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={`modal-dialog modal-${size} modal-dialog-scrollable modal-dialog-centered`}>
          <div className="modal-content cp-modal">
            <div className="modal-header">
              <h2 className="modal-title h5 mb-0">{title}</h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
}

/* ---------------- Leaflet map (view + location picker) ---------------- */
function MapView({ markers = [], height = 440, picker = false, value = null, onPick, radius = 0, fit = false, config }) {
  const el = useRef(null);
  const map = useRef(null);
  const markerLayer = useRef(null);
  const pickLayer = useRef(null);
  const markersRef = useRef(markers);
  const onPickRef = useRef(onPick);
  markersRef.current = markers;
  onPickRef.current = onPick;

  useEffect(() => {
    map.current = L.map(el.current, { scrollWheelZoom: !picker }).setView([config.lat, config.lng], config.zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map.current);
    markerLayer.current = L.layerGroup().addTo(map.current);
    pickLayer.current = L.layerGroup().addTo(map.current);
    if (picker) map.current.on('click', (e) => onPickRef.current && onPickRef.current(e.latlng.lat, e.latlng.lng));
    setTimeout(() => map.current && map.current.invalidateSize(), 150);
    return () => { map.current.remove(); map.current = null; };
  }, []);

  const sig = markers.map((m) => `${m.id}:${m.color}:${m.lat}:${m.lng}`).join('|');
  useEffect(() => {
    if (!map.current) return;
    markerLayer.current.clearLayers();
    const pts = [];
    markers.forEach((m) => {
      const icon = L.divIcon({
        className: '',
        html: `<div class="cp-pin" style="--c:${m.color}"><i class="bi ${m.icon || 'bi-geo-alt-fill'}"></i></div>`,
        iconSize: [34, 34], iconAnchor: [17, 40],
      });
      const mk = L.marker([m.lat, m.lng], { icon }).addTo(markerLayer.current);
      if (m.tip) mk.bindTooltip(esc(m.tip), { direction: 'top', offset: [0, -34] });
      mk.on('click', () => {
        const cur = markersRef.current.find((x) => x.id === m.id);
        if (cur && cur.onClick) cur.onClick();
      });
      pts.push([m.lat, m.lng]);
    });
    if (fit && pts.length) map.current.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
  }, [sig]);

  useEffect(() => {
    if (!map.current) return;
    pickLayer.current.clearLayers();
    if (!value) return;
    const icon = L.divIcon({
      className: '',
      html: '<div class="cp-pin" style="--c:#F5A524"><i class="bi bi-geo-alt-fill" style="color:#0E2A47"></i></div>',
      iconSize: [34, 34], iconAnchor: [17, 40],
    });
    L.marker([value.lat, value.lng], { icon }).addTo(pickLayer.current);
    if (radius > 0) L.circle([value.lat, value.lng], { radius, color: '#0B7F70', weight: 1.5, fillColor: '#0B7F70', fillOpacity: 0.1 }).addTo(pickLayer.current);
    map.current.panTo([value.lat, value.lng]);
  }, [value && value.lat, value && value.lng, radius]);

  return <div ref={el} className="cp-map" style={{ height }}></div>;
}

const issueMarkers = (issues, onSelect) =>
  issues.map((i) => ({
    id: i.id, lat: i.latitude, lng: i.longitude,
    color: LEVEL_COLORS[i.priority_level], icon: i.category_icon,
    tip: `${i.title} · ${i.priority_level} (${i.priority_score.toFixed(0)})`,
    onClick: () => onSelect(i.id),
  }));

/* ---------------- Navbar / footer ---------------- */
function Navbar({ page, go, admin }) {
  const [open, setOpen] = useState(false);
  const links = [
    ['home', 'Home', 'bi-house'], ['report', 'Report an issue', 'bi-plus-circle'],
    ['map', 'Live map', 'bi-geo-alt'], ['issues', 'All issues', 'bi-list-check'],
    ['admin', admin ? 'Admin panel' : 'Official login', 'bi-shield-lock'],
  ];
  return (
    <nav className="cp-nav navbar navbar-expand-lg">
      <div className="container">
        <a className="cp-brand" href="#home" onClick={(e) => { e.preventDefault(); go('home'); }}>
          <svg width="34" height="34" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" fill="#173A5E" />
            <path d="M12 52h20l9-24 14 44 10-28 6 8h17" fill="none" stroke="#F5A524" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          CivicPulse
        </a>
        <button className="navbar-toggler" type="button" aria-label="Toggle navigation" onClick={() => setOpen(!open)}>
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className={`collapse navbar-collapse ${open ? 'show' : ''}`}>
          <ul className="navbar-nav ms-auto gap-lg-1 pt-3 pt-lg-0">
            {links.map(([key, label, icon]) => (
              <li className="nav-item" key={key}>
                <a className={`nav-link ${page === key ? 'active' : ''}`} href={`#${key}`}
                   onClick={(e) => { e.preventDefault(); setOpen(false); go(key); }}>
                  <i className={`bi ${icon} me-1`}></i>{label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="cp-footer">
      <div className="container d-flex flex-wrap justify-content-between gap-3">
        <div>
          <div className="cp-display text-white fw-bold fs-5">CivicPulse</div>
          <div>Intelligent civic issue reporting, prioritization and resolution.</div>
        </div>
        <div className="small">
          Built with React, Bootstrap, Node.js and MySQL.<br />
          Duplicate engine: Haversine distance + Jaccard text similarity.
        </div>
      </div>
    </footer>
  );
}

/* =====================================================================
   HOME
   ===================================================================== */
function Home({ go, stats, issues, settings, openIssue }) {
  const top = issues.filter((i) => i.priority_level !== 'Closed').slice(0, 4);
  const statCards = stats ? [
    ['bi-flag', 'Unique issues', stats.total, 'var(--cp-signal-soft)', 'var(--cp-signal)'],
    ['bi-hourglass-split', 'Open right now', stats.open, 'var(--cp-amber-soft)', '#B97800'],
    ['bi-check2-circle', 'Resolved', stats.resolved, '#DDF3E6', '#1B6B3B'],
    ['bi-intersect', 'Duplicate reports merged', stats.duplicates_merged, '#E4EBF5', '#2B4A78'],
  ] : [];
  const totalStatus = stats ? stats.by_status.reduce((s, r) => s + r.count, 0) || 1 : 1;
  const maxCat = stats ? Math.max(1, ...stats.by_category.map((c) => c.count)) : 1;
  const statusColors = { Reported: '#3B5F99', Acknowledged: '#6A58C7', 'In Progress': '#E2A11B', Resolved: '#0B7F70', Rejected: '#8A97A8' };

  return (
    <>
      <section className="cp-hero">
        <div className="container">
          <div className="row align-items-center g-5">
            <div className="col-lg-6">
              <h1 className="mb-3">The problems on your street, ranked by how urgent they are.</h1>
              <p className="lead mb-4">
                Report potholes, dark streetlights and overflowing bins with a pin on the map. CivicPulse merges repeat reports
                and lets neighbours confirm them, so the most pressing issues rise to the top of the city's work queue.
              </p>
              <div className="d-flex flex-wrap gap-2">
                <button className="btn btn-amber btn-lg px-4" onClick={() => go('report')}><i className="bi bi-plus-circle me-2"></i>Report an issue</button>
                <button className="btn btn-outline-light-soft btn-lg px-4" onClick={() => go('map')}><i className="bi bi-geo-alt me-2"></i>Open the live map</button>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="cp-queue">
                <div className="cp-queue-head"><span className="cp-pulse-dot"></span>Today's priority queue</div>
                {top.length === 0 && <Empty icon="bi-emoji-smile" title="Nothing urgent" text="No open issues right now." />}
                {top.map((i) => (
                  <div className="cp-queue-row" key={i.id} onClick={() => openIssue(i.id)} role="button" tabIndex="0"
                       onKeyDown={(e) => e.key === 'Enter' && openIssue(i.id)}>
                    <i className={`bi ${i.category_icon} fs-4`} style={{ color: i.category_color }}></i>
                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                      <div className="cp-issue-title text-truncate">{i.title}</div>
                      <div className="small text-muted">{i.confirmations} confirmations · open {ageLabel(i.age_days)}</div>
                    </div>
                    <div className="text-end">
                      <div className="cp-queue-score" style={{ color: LEVEL_COLORS[i.priority_level] }}>{i.priority_score.toFixed(0)}</div>
                      <LevelPill level={i.priority_level} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container cp-strip">
        <div className="row g-3">
          {statCards.map(([icon, label, num, bg, fg]) => (
            <div className="col-6 col-lg-3" key={label}>
              <div className="cp-stat">
                <div className="ico" style={{ background: bg, color: fg }}><i className={`bi ${icon}`}></i></div>
                <div><div className="num">{num}</div><div className="lbl">{label}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <section className="cp-section">
        <div className="container">
          <h2 className="mb-4">From a pin on the map to a fixed street</h2>
          <div className="row g-4">
            {[
              ['Report with a location', 'Pick a category, describe the problem and drop a pin. It takes about a minute and needs no account.'],
              ['The engine checks for repeats', 'We compare your pin and wording with open issues nearby. If it is already reported, you confirm it instead of duplicating it.'],
              ['Neighbours add weight', 'Every confirmation raises the priority score, together with how dangerous the category is and how long the issue has waited.'],
              ['Officials triage and resolve', 'Municipal teams sort the dashboard by priority and move each issue from Reported to Resolved, with every step on record.'],
            ].map(([t, d], idx) => (
              <div className="col-md-6 col-lg-3" key={t}>
                <div className="cp-step">
                  <div className="n">{idx + 1}</div>
                  <div><h3>{t}</h3><p className="text-muted mb-0">{d}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container pb-4">
        <div className="cp-engine">
          <h2 className="mb-2">Under the hood</h2>
          <p className="muted mb-4" style={{ maxWidth: '70ch' }}>
            Three small formulas keep the queue honest. Current settings: duplicates are reports within{' '}
            <strong className="text-white">{settings ? settings.duplicate_radius_m : 100} m</strong> sharing at least{' '}
            <strong className="text-white">{settings ? pct(settings.jaccard_threshold) : '30%'}</strong> of their wording.
          </p>
          <div className="row g-3">
            <div className="col-lg-4">
              <div className="cp-formula-card">
                <h3><i className="bi bi-compass me-2"></i>Haversine distance</h3>
                <p className="muted small">Measures the real distance in metres between two pins on the curved Earth.</p>
                <div className="cp-formula">{`a = sin²(Δφ/2) + cos φ₁·cos φ₂·sin²(Δλ/2)\nd = 2R · asin(√a)    R = 6,371 km`}</div>
              </div>
            </div>
            <div className="col-lg-4">
              <div className="cp-formula-card">
                <h3><i className="bi bi-chat-square-text me-2"></i>Jaccard similarity</h3>
                <p className="muted small">Compares the meaningful words in two reports. 0 means nothing shared, 1 means identical.</p>
                <div className="cp-formula">{`J(A, B) = |A ∩ B| / |A ∪ B|\nA, B = word sets after removing\n        filler words`}</div>
              </div>
            </div>
            <div className="col-lg-4">
              <div className="cp-formula-card">
                <h3><i className="bi bi-speedometer2 me-2"></i>Priority score</h3>
                <p className="muted small">Recalculated every time the list loads, so waiting issues climb the queue.</p>
                <div className="cp-formula">{`score = ${settings ? settings.w_severity : 10}·severity\n      + ${settings ? settings.w_confirmations : 4}·confirmations\n      + ${settings ? settings.w_age : 1.5}·min(days open, ${settings ? settings.age_cap_days : 60})`}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {stats && (
        <section className="cp-section-tight">
          <div className="container">
            <div className="row g-4">
              <div className="col-lg-7">
                <div className="cp-card cp-card-pad h-100">
                  <h2 className="h4 mb-3">Where issues pile up</h2>
                  {stats.by_category.map((c) => (
                    <div className="d-flex align-items-center gap-3 mb-2" key={c.name}>
                      <div style={{ width: 170 }} className="cat-chip"><i className={`bi ${c.icon}`} style={{ background: c.color }}></i>{c.name}</div>
                      <div className="score-track flex-grow-1" style={{ height: 12 }}>
                        <div className="score-fill" style={{ width: `${(c.count / maxCat) * 100}%`, background: c.color }}></div>
                      </div>
                      <strong style={{ width: 24, textAlign: 'right' }}>{c.count}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="col-lg-5">
                <div className="cp-card cp-card-pad h-100">
                  <h2 className="h4 mb-3">Resolution progress</h2>
                  <div className="break-bar mb-3" style={{ height: 20 }}>
                    {stats.by_status.map((s) => (
                      <div key={s.status} title={`${s.status}: ${s.count}`} style={{ width: `${(s.count / totalStatus) * 100}%`, background: statusColors[s.status] }}></div>
                    ))}
                  </div>
                  <div className="d-grid gap-2">
                    {STATUSES.map((s) => {
                      const row = stats.by_status.find((r) => r.status === s);
                      return (
                        <div className="d-flex justify-content-between align-items-center" key={s}>
                          <span className="d-flex align-items-center gap-2"><span style={{ width: 10, height: 10, borderRadius: '50%', background: statusColors[s] }}></span>{s}</span>
                          <strong>{row ? row.count : 0}</strong>
                        </div>
                      );
                    })}
                  </div>
                  <hr />
                  <div className="d-flex justify-content-between"><span className="text-muted">Average time to resolve</span>
                    <strong>{stats.avg_resolution_hours === null ? '–' : stats.avg_resolution_hours >= 48 ? `${Math.round(stats.avg_resolution_hours / 24)} days` : `${stats.avg_resolution_hours} hours`}</strong></div>
                  <div className="d-flex justify-content-between mt-2"><span className="text-muted">Community confirmations</span><strong>{stats.total_confirmations}</strong></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* =====================================================================
   REPORT AN ISSUE
   ===================================================================== */
function DuplicateList({ matches, onMerge, busy, onView }) {
  return (
    <div className="d-grid gap-2">
      {matches.map((m) => (
        <div className="dup-item" key={m.id}>
          <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
            <div style={{ minWidth: 0 }}>
              <div className="cp-issue-title">{m.title}</div>
              <div className="small text-muted">{m.description.length > 110 ? m.description.slice(0, 110) + '…' : m.description}</div>
            </div>
            <StatusPill status={m.status} />
          </div>
          <div className="d-flex flex-wrap gap-4 mt-2 align-items-end">
            <div className="metric">Distance (Haversine)<br /><b>{m.distance_m} m</b></div>
            <div className="metric">Wording match (Jaccard)<br /><b>{pct(m.text_similarity)}</b></div>
            <div className="metric">Confidence<br /><b>{pct(m.confidence)}</b></div>
            <div className="metric">Confirmations<br /><b>{m.confirmations}</b></div>
            <div className="ms-auto d-flex gap-2">
              {onView && <button type="button" className="btn btn-sm btn-outline-ink" onClick={() => onView(m.id)}>View</button>}
              {onMerge && <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => onMerge(m.id)}>
                <i className="bi bi-hand-thumbs-up me-1"></i>Same issue, add my report</button>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportPage({ categories, config, settings, refresh, go, openIssue }) {
  const notify = useToast();
  const empty = { reporter_name: '', category_id: '', title: '', description: '', address: '' };
  const [form, setForm] = useState(empty);
  const [pos, setPos] = useState(null);
  const [live, setLive] = useState([]);
  const [dupModal, setDupModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Live duplicate preview while the citizen is typing
  useEffect(() => {
    if (!pos || !form.category_id) { setLive([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await api('/issues/check-duplicates', {
          method: 'POST',
          body: { latitude: pos.lat, longitude: pos.lng, category_id: Number(form.category_id), title: form.title, description: form.description },
        });
        setLive(d.matches);
      } catch (e) { /* preview is best effort */ }
    }, 500);
    return () => clearTimeout(t);
  }, [pos && pos.lat, pos && pos.lng, form.category_id, form.title, form.description]);

  const payload = (extra = {}) => ({
    ...form, category_id: Number(form.category_id),
    latitude: pos ? pos.lat : null, longitude: pos ? pos.lng : null,
    voter_key: getVoterKey(), ...extra,
  });

  async function submit(e, force = false) {
    if (e) e.preventDefault();
    if (!pos) return notify('Click the map to mark where the problem is.', 'warning');
    setBusy(true);
    try {
      const r = await api('/issues', { method: 'POST', body: payload({ force }) });
      setDone({ merged: false, id: r.id });
      setDupModal(null);
      refresh();
    } catch (err) {
      if (err.status === 409 && err.data && err.data.duplicate) setDupModal(err.data.matches);
      else notify(err.message, 'danger');
    } finally { setBusy(false); }
  }

  async function mergeInto(id) {
    setBusy(true);
    try {
      const r = await api(`/issues/${id}/merge`, { method: 'POST', body: payload() });
      setDone({ merged: true, id, confirmed: r.confirmed });
      setDupModal(null);
      refresh();
    } catch (err) { notify(err.message, 'danger'); } finally { setBusy(false); }
  }

  function locate() {
    if (!navigator.geolocation) return notify('Your browser does not support location access.', 'warning');
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => notify('Could not read your location. Click the map to place the pin instead.', 'warning')
    );
  }

  if (done) {
    return (
      <div className="container cp-section" style={{ maxWidth: 640 }}>
        <div className="cp-card cp-card-pad text-center">
          <div className="mx-auto mb-3 d-grid" style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--cp-signal-soft)', placeItems: 'center', color: 'var(--cp-signal)', fontSize: '2rem' }}>
            <i className={`bi ${done.merged ? 'bi-intersect' : 'bi-check2-circle'}`}></i>
          </div>
          <h2 className="mb-2">{done.merged ? `Added to issue #${done.id}` : `Issue #${done.id} reported`}</h2>
          <p className="text-muted">
            {done.merged
              ? (done.confirmed ? 'Your report was merged with the existing issue and raised its priority.' : 'Your report was added to the existing issue. You had already confirmed it, so the confirmation count is unchanged.')
              : 'Thank you. Officials can now see it and neighbours can confirm it.'}
          </p>
          <div className="d-flex gap-2 justify-content-center flex-wrap">
            <button className="btn btn-primary" onClick={() => openIssue(done.id)}>View the issue</button>
            <button className="btn btn-outline-ink" onClick={() => go('map')}>See it on the map</button>
            <button className="btn btn-outline-ink" onClick={() => { setDone(null); setForm(empty); setPos(null); setLive([]); }}>Report another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHead title="Report an issue" subtitle="Tell us what is wrong and where. If someone has already reported it, we will help you add your voice to that report instead." />
      <div className="container cp-section-tight">
        <form onSubmit={(e) => submit(e, false)}>
          <div className="row g-4">
            <div className="col-lg-5">
              <div className="cp-card cp-card-pad">
                <div className="mb-3">
                  <label className="form-label" htmlFor="cat">What kind of problem is it?</label>
                  <select id="cat" className="form-select" required value={form.category_id} onChange={set('category_id')}>
                    <option value="">Choose a category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="title">Short title</label>
                  <input id="title" className="form-control" required minLength="4" maxLength="150" placeholder="e.g. Deep pothole near the bus stop" value={form.title} onChange={set('title')} />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="desc">What is happening?</label>
                  <textarea id="desc" className="form-control" rows="4" required minLength="10" placeholder="Describe the problem and how it affects people." value={form.description} onChange={set('description')}></textarea>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="addr">Landmark or street <span className="text-muted fw-normal">(optional)</span></label>
                  <input id="addr" className="form-control" maxLength="255" placeholder="Near the temple gate, Sector 7" value={form.address} onChange={set('address')} />
                </div>
                <div className="mb-4">
                  <label className="form-label" htmlFor="rn">Your name <span className="text-muted fw-normal">(optional)</span></label>
                  <input id="rn" className="form-control" maxLength="100" value={form.reporter_name} onChange={set('reporter_name')} />
                </div>
                <button className="btn btn-primary btn-lg w-100" disabled={busy}>
                  {busy ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-send me-2"></i>}Submit report
                </button>
              </div>
            </div>

            <div className="col-lg-7">
              <div className="cp-card cp-card-pad mb-3">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                  <label className="form-label mb-0">Click the map to mark the exact spot</label>
                  <button type="button" className="btn btn-sm btn-outline-ink" onClick={locate}><i className="bi bi-crosshair me-1"></i>Use my location</button>
                </div>
                <MapView config={config} height={340} picker value={pos} onPick={(lat, lng) => setPos({ lat, lng })} radius={settings ? settings.duplicate_radius_m : 100} />
                <div className="small text-muted mt-2">
                  {pos ? <>Pinned at <b>{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</b>. The green circle is the {settings ? settings.duplicate_radius_m : 100} m area we search for repeat reports.</> : 'No location chosen yet.'}
                </div>
              </div>

              {live.length > 0 && (
                <div className="dup-box">
                  <div className="d-flex gap-2 align-items-center mb-2">
                    <i className="bi bi-exclamation-diamond-fill" style={{ color: '#B97800' }}></i>
                    <strong style={{ color: 'var(--cp-ink)' }}>This may already be reported nearby</strong>
                  </div>
                  <DuplicateList matches={live.slice(0, 3)} onMerge={mergeInto} busy={busy} onView={openIssue} />
                </div>
              )}
            </div>
          </div>
        </form>
      </div>

      {dupModal && (
        <Modal title="Is this the same problem?" onClose={() => setDupModal(null)}
          footer={<>
            <button className="btn btn-outline-ink" onClick={() => setDupModal(null)}>Go back and edit</button>
            <button className="btn btn-amber" disabled={busy} onClick={() => submit(null, true)}>No, submit as a new issue</button>
          </>}>
          <p className="text-muted">Open issues in the same category were found within {settings ? settings.duplicate_radius_m : 100} m with similar wording. Adding to an existing issue raises its priority faster than a separate report.</p>
          <DuplicateList matches={dupModal} onMerge={mergeInto} busy={busy} onView={openIssue} />
        </Modal>
      )}
    </>
  );
}

/* =====================================================================
   LIVE MAP
   ===================================================================== */
function MapPage({ issues, categories, config, openIssue }) {
  const [cat, setCat] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const list = useMemo(() => issues.filter((i) =>
    (!cat || String(i.category_id) === cat) && (showClosed || i.priority_level !== 'Closed')), [issues, cat, showClosed]);
  return (
    <>
      <PageHead title="Live issue map" subtitle="Every pin is a unique issue. The colour shows its current priority, and the icon shows the category.">
        <div className="d-flex gap-2 flex-wrap align-items-center">
          <select className="form-select" style={{ width: 210 }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="form-check form-switch mb-0">
            <input className="form-check-input" type="checkbox" id="closed" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            <label className="form-check-label" htmlFor="closed">Show closed</label>
          </div>
        </div>
      </PageHead>
      <div className="container cp-section-tight">
        <div className="row g-4">
          <div className="col-lg-8">
            <MapView config={config} height={600} markers={issueMarkers(list, openIssue)} fit />
            <div className="cp-legend mt-3">
              {Object.entries(LEVEL_COLORS).map(([k, v]) => <span key={k} style={{ '--d': v }}>{k}</span>)}
            </div>
          </div>
          <div className="col-lg-4">
            <div className="cp-card">
              <div className="p-3 border-bottom fw-bold" style={{ color: 'var(--cp-ink)' }}>{list.length} issues, highest priority first</div>
              <div className="cp-side-list">
                {list.length === 0 && <Empty icon="bi-geo" title="No issues match" text="Try another category." />}
                {list.map((i) => (
                  <div className="cp-side-item" key={i.id} onClick={() => openIssue(i.id)} role="button" tabIndex="0" onKeyDown={(e) => e.key === 'Enter' && openIssue(i.id)}>
                    <div className="d-flex justify-content-between gap-2">
                      <span className="cp-issue-title">{i.title}</span>
                      <LevelPill level={i.priority_level} />
                    </div>
                    <div className="d-flex justify-content-between align-items-center mt-1">
                      <CategoryChip issue={i} />
                      <span className="small text-muted"><i className="bi bi-hand-thumbs-up me-1"></i>{i.confirmations}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* =====================================================================
   ISSUE TABLE (sortable) – used by public dashboard and admin triage
   ===================================================================== */
const SORT_KEYS = {
  priority_score: (i) => i.priority_score, confirmations: (i) => i.confirmations,
  age_days: (i) => i.age_days, status: (i) => STATUSES.indexOf(i.status),
  category_name: (i) => i.category_name.toLowerCase(), title: (i) => i.title.toLowerCase(),
};
function sortIssues(list, { key, dir }) {
  const fn = SORT_KEYS[key];
  return [...list].sort((a, b) => {
    const x = fn(a), y = fn(b);
    const c = x < y ? -1 : x > y ? 1 : 0;
    return (dir === 'asc' ? c : -c) || b.priority_score - a.priority_score;
  });
}

function IssueTable({ issues, sort, setSort, onOpen, onConfirm, onStatus }) {
  const th = (key, label, extra = '') => (
    <th className={`sortable ${extra}`} onClick={() => setSort({ key, dir: sort.key === key && sort.dir === 'desc' ? 'asc' : 'desc' })}
        aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {label}{' '}
      <i className={`bi ${sort.key === key ? (sort.dir === 'asc' ? 'bi-sort-up' : 'bi-sort-down') : 'bi-arrow-down-up'}`} style={{ opacity: sort.key === key ? 1 : .35 }}></i>
    </th>
  );
  if (!issues.length) return <Empty icon="bi-search" title="No issues match these filters" text="Clear a filter or try another search." />;
  return (
    <div className="table-responsive">
      <table className="table cp-table align-middle">
        <thead>
          <tr>
            <th>#</th>{th('title', 'Issue')}{th('category_name', 'Category')}
            {th('priority_score', 'Priority', 'text-nowrap')}{th('confirmations', 'Confirmations')}
            {th('age_days', 'Open for')}{th('status', 'Status')}
          </tr>
        </thead>
        <tbody>
          {issues.map((i) => (
            <tr key={i.id} onClick={() => onOpen(i.id)}>
              <td className="text-muted">{i.id}</td>
              <td style={{ minWidth: 230 }}>
                <div className="cp-issue-title">{i.title}</div>
                <div className="small text-muted">{i.address || `${i.latitude.toFixed(4)}, ${i.longitude.toFixed(4)}`}
                  {i.report_count > 1 && <span className="ms-2"><i className="bi bi-intersect"></i> {i.report_count} reports merged</span>}</div>
              </td>
              <td><CategoryChip issue={i} /></td>
              <td style={{ minWidth: 190 }}>
                <ScoreBar score={i.priority_score} level={i.priority_level} />
                <LevelPill level={i.priority_level} />
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <button className="vote-btn" disabled={!onConfirm || i.priority_level === 'Closed'} onClick={() => onConfirm(i.id)} title="I see this problem too">
                  <i className="bi bi-hand-thumbs-up"></i>{i.confirmations}
                </button>
              </td>
              <td className="text-nowrap">{ageLabel(i.age_days)}</td>
              <td onClick={(e) => e.stopPropagation()} style={{ minWidth: 150 }}>
                {onStatus ? (
                  <select className="form-select form-select-sm" value={i.status} onChange={(e) => onStatus(i, e.target.value)} aria-label={`Status of issue ${i.id}`}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                ) : <StatusPill status={i.status} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useFilters(issues, defaultStatus = '') {
  const [f, setF] = useState({ q: '', status: defaultStatus, category: '', level: '' });
  const filtered = useMemo(() => issues.filter((i) =>
    (!f.q || `${i.title} ${i.description} ${i.address || ''}`.toLowerCase().includes(f.q.toLowerCase())) &&
    (!f.status || (f.status === 'open' ? i.priority_level !== 'Closed' : i.status === f.status)) &&
    (!f.category || String(i.category_id) === f.category) &&
    (!f.level || i.priority_level === f.level)), [issues, f]);
  return [f, setF, filtered];
}

function Filters({ f, setF, categories }) {
  return (
    <div className="row g-2 mb-3">
      <div className="col-md-4"><div className="input-group"><span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
        <input className="form-control" placeholder="Search title, description or place" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div></div>
      <div className="col-6 col-md-2"><select className="form-select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status">
        <option value="">Any status</option><option value="open">All open</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
      <div className="col-6 col-md-3"><select className="form-select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Category">
        <option value="">Any category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className="col-6 col-md-2"><select className="form-select" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} aria-label="Priority">
        <option value="">Any priority</option>{['Critical', 'High', 'Medium', 'Low'].map((l) => <option key={l}>{l}</option>)}</select></div>
      <div className="col-6 col-md-1"><button className="btn btn-outline-ink w-100" onClick={() => setF({ q: '', status: '', category: '', level: '' })} title="Clear filters"><i className="bi bi-x-lg"></i></button></div>
    </div>
  );
}

function IssuesPage({ issues, categories, openIssue, confirmIssue, go }) {
  const [f, setF, filtered] = useFilters(issues);
  const [sort, setSort] = useState({ key: 'priority_score', dir: 'desc' });
  const rows = useMemo(() => sortIssues(filtered, sort), [filtered, sort]);
  return (
    <>
      <PageHead title="All issues" subtitle="Sorted by priority by default. Click any column heading to sort, or press the thumbs-up to confirm a problem you have seen too.">
        <button className="btn btn-primary" onClick={() => go('report')}><i className="bi bi-plus-circle me-2"></i>Report an issue</button>
      </PageHead>
      <div className="container cp-section-tight">
        <Filters f={f} setF={setF} categories={categories} />
        <div className="cp-card overflow-hidden">
          <IssueTable issues={rows} sort={sort} setSort={setSort} onOpen={openIssue} onConfirm={confirmIssue} />
        </div>
        <div className="small text-muted mt-2">Showing {rows.length} of {issues.length} issues</div>
      </div>
    </>
  );
}

/* =====================================================================
   ISSUE DETAIL MODAL
   ===================================================================== */
function IssueDetail({ id, config, admin, onClose, refresh, confirmIssue }) {
  const notify = useToast();
  const [issue, setIssue] = useState(null);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api(`/issues/${id}`); setIssue(d); setStatus(d.status); }
    catch (e) { notify(e.message, 'danger'); onClose(); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function updateStatus() {
    setBusy(true);
    try {
      await api(`/issues/${id}/status`, { method: 'PATCH', body: { status, note } });
      notify(`Status changed to ${status}`);
      setNote(''); await load(); refresh();
    } catch (e) { notify(e.message, 'danger'); } finally { setBusy(false); }
  }

  if (!issue) return <Modal title="Loading issue…" onClose={onClose}><div className="text-center py-5"><div className="spinner-border text-primary"></div></div></Modal>;

  const b = issue.breakdown;
  const total = Math.max(1, b.severity + b.confirmations + b.age);
  return (
    <Modal title={`Issue #${issue.id}`} onClose={onClose} size="xl">
      <div className="row g-4">
        <div className="col-lg-7">
          <div className="d-flex flex-wrap gap-2 mb-2"><StatusPill status={issue.status} /><LevelPill level={issue.priority_level} /></div>
          <h3 className="mb-2">{issue.title}</h3>
          <div className="mb-3"><CategoryChip issue={issue} /></div>
          <p>{issue.description}</p>
          <div className="small text-muted mb-3">
            <i className="bi bi-geo-alt me-1"></i>{issue.address || 'No landmark given'} ({issue.latitude.toFixed(5)}, {issue.longitude.toFixed(5)})<br />
            <i className="bi bi-person me-1"></i>First reported by {issue.reporter_name} on {fmtDate(issue.created_at)}
          </div>
          <MapView config={{ lat: issue.latitude, lng: issue.longitude, zoom: 16 }} height={220}
            markers={[{ id: issue.id, lat: issue.latitude, lng: issue.longitude, color: LEVEL_COLORS[issue.priority_level], icon: issue.category_icon }]} />

          <h4 className="h6 mt-4 mb-2">Why this priority score?</h4>
          <div className="cp-card cp-card-pad" style={{ padding: '1rem' }}>
            <div className="d-flex justify-content-between align-items-baseline mb-2">
              <span className="text-muted">Priority score</span>
              <span className="cp-display fs-3 fw-bold" style={{ color: LEVEL_COLORS[issue.priority_level] }}>{issue.priority_score.toFixed(1)}</span>
            </div>
            <div className="break-bar mb-2">
              <div style={{ width: `${(b.severity / total) * 100}%`, background: '#0E2A47' }} title="Category severity"></div>
              <div style={{ width: `${(b.confirmations / total) * 100}%`, background: '#0B7F70' }} title="Confirmations"></div>
              <div style={{ width: `${(b.age / total) * 100}%`, background: '#F5A524' }} title="Age"></div>
            </div>
            <div className="row small text-center g-2">
              <div className="col-4"><span className="d-block fw-bold" style={{ color: '#0E2A47' }}>{b.severity}</span>Severity ({issue.category_name}: {issue.severity_weight}/10)</div>
              <div className="col-4"><span className="d-block fw-bold" style={{ color: '#0B7F70' }}>{b.confirmations}</span>{issue.confirmations} confirmations</div>
              <div className="col-4"><span className="d-block fw-bold" style={{ color: '#B97800' }}>{b.age}</span>Open {ageLabel(issue.age_days)}</div>
            </div>
          </div>
        </div>

        <div className="col-lg-5">
          <button className="btn btn-primary w-100 mb-3" disabled={issue.priority_level === 'Closed'} onClick={async () => { await confirmIssue(issue.id); load(); }}>
            <i className="bi bi-hand-thumbs-up me-2"></i>I see this problem too ({issue.confirmations})
          </button>

          {admin && (
            <div className="cp-card cp-card-pad mb-3" style={{ padding: '1rem', borderColor: 'var(--cp-amber)' }}>
              <h4 className="h6"><i className="bi bi-shield-check me-1"></i>Update status</h4>
              <select className="form-select mb-2" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              <input className="form-control mb-2" placeholder="Note for the record (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength="255" />
              <button className="btn btn-amber w-100" disabled={busy || status === issue.status} onClick={updateStatus}>Save status</button>
            </div>
          )}

          <h4 className="h6">Status timeline</h4>
          <ul className="timeline mb-4">
            {issue.history.map((h) => (
              <li key={h.id}>
                <div><StatusPill status={h.new_status} /></div>
                <div className="small text-muted mt-1">{fmtDate(h.changed_at)}{h.changed_by ? ` · ${h.changed_by}` : ''}</div>
                {h.note && <div className="small">{h.note}</div>}
              </li>
            ))}
          </ul>

          <h4 className="h6">Reports consolidated here ({issue.reports.length})</h4>
          <div className="d-grid gap-2" style={{ maxHeight: 260, overflowY: 'auto' }}>
            {issue.reports.map((r) => (
              <div className="p-2 border rounded-3 small bg-white" key={r.id}>
                <div className="d-flex justify-content-between"><strong>{r.reporter_name}</strong><span className="text-muted">{fmtDate(r.created_at)}</span></div>
                <div className="text-muted">{r.description}</div>
                <div className="mt-1 text-muted"><i className="bi bi-rulers me-1"></i>{Number(r.distance_from_issue_m)} m away · <i className="bi bi-chat-square-text me-1"></i>{pct(Number(r.text_similarity))} wording match</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* =====================================================================
   ADMIN PANEL
   ===================================================================== */
function AdminLogin({ onLogin }) {
  const notify = useToast();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { username: u, password: p } });
      sessionStorage.setItem('cp_token', r.token); sessionStorage.setItem('cp_admin', r.username);
      onLogin(r.username);
    } catch (err) { notify(err.message, 'danger'); } finally { setBusy(false); }
  }
  return (
    <div className="container cp-section" style={{ maxWidth: 440 }}>
      <form className="cp-card cp-card-pad" onSubmit={submit}>
        <div className="mb-3 d-grid" style={{ width: 54, height: 54, borderRadius: 14, background: 'var(--cp-ink)', color: 'var(--cp-amber)', placeItems: 'center', fontSize: '1.5rem' }}><i className="bi bi-shield-lock"></i></div>
        <h1 className="h3">Official login</h1>
        <p className="text-muted">For municipal staff who triage issues and manage categories.</p>
        <div className="mb-3"><label className="form-label" htmlFor="u">Username</label><input id="u" className="form-control" autoComplete="username" required value={u} onChange={(e) => setU(e.target.value)} /></div>
        <div className="mb-4"><label className="form-label" htmlFor="p">Password</label><input id="p" type="password" className="form-control" autoComplete="current-password" required value={p} onChange={(e) => setP(e.target.value)} /></div>
        <button className="btn btn-ink w-100 btn-lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

function TriageTab({ issues, categories, openIssue, refresh }) {
  const notify = useToast();
  const [f, setF, filtered] = useFilters(issues, 'open');
  const [sort, setSort] = useState({ key: 'priority_score', dir: 'desc' });
  const rows = useMemo(() => sortIssues(filtered, sort), [filtered, sort]);
  async function changeStatus(issue, status) {
    try { await api(`/issues/${issue.id}/status`, { method: 'PATCH', body: { status, note: 'Updated from triage dashboard' } }); notify(`#${issue.id} is now ${status}`); refresh(); }
    catch (e) { notify(e.message, 'danger'); }
  }
  const open = issues.filter((i) => i.priority_level !== 'Closed');
  const critical = open.filter((i) => i.priority_level === 'Critical').length;
  const high = open.filter((i) => i.priority_level === 'High').length;
  const fresh = open.filter((i) => i.status === 'Reported').length;
  return (
    <>
      <div className="row g-3 mb-4">
        {[['Critical now', critical, 'var(--lvl-critical)'], ['High priority', high, 'var(--lvl-high)'], ['Awaiting acknowledgement', fresh, 'var(--cp-ink)'], ['Open in total', open.length, 'var(--cp-signal)']].map(([l, n, c]) => (
          <div className="col-6 col-lg-3" key={l}><div className="cp-stat"><div className="num" style={{ color: c }}>{n}</div><div className="lbl">{l}</div></div></div>
        ))}
      </div>
      <Filters f={f} setF={setF} categories={categories} />
      <div className="cp-card overflow-hidden"><IssueTable issues={rows} sort={sort} setSort={setSort} onOpen={openIssue} onStatus={changeStatus} /></div>
    </>
  );
}

function CategoryRow({ cat, onSaved }) {
  const notify = useToast();
  const [c, setC] = useState(cat);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(c) !== JSON.stringify(cat);
  async function save() {
    setBusy(true);
    try { await api(`/categories/${cat.id}`, { method: 'PUT', body: c }); notify('Category saved'); onSaved(); }
    catch (e) { notify(e.message, 'danger'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm(`Delete "${cat.name}"?`)) return;
    try { await api(`/categories/${cat.id}`, { method: 'DELETE' }); notify('Category deleted'); onSaved(); }
    catch (e) { notify(e.message, 'danger'); }
  }
  return (
    <tr>
      <td><i className={`bi ${c.icon}`} style={{ background: c.color, color: '#fff', width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center' }}></i></td>
      <td style={{ minWidth: 170 }}><input className="form-control form-control-sm" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} aria-label="Category name" /></td>
      <td><select className="form-select form-select-sm" value={c.icon} onChange={(e) => setC({ ...c, icon: e.target.value })} aria-label="Icon">
        {ICON_CHOICES.map((i) => <option key={i} value={i}>{i.replace('bi-', '')}</option>)}</select></td>
      <td><input type="color" className="form-control form-control-color" value={c.color} onChange={(e) => setC({ ...c, color: e.target.value })} aria-label="Colour" /></td>
      <td style={{ minWidth: 190 }}>
        <div className="d-flex align-items-center gap-2">
          <input type="range" min="1" max="10" className="form-range weight-range" value={c.severity_weight} onChange={(e) => setC({ ...c, severity_weight: Number(e.target.value) })} aria-label="Severity weight" />
          <strong style={{ width: 22 }}>{c.severity_weight}</strong>
        </div>
      </td>
      <td className="text-muted">{cat.issue_count}</td>
      <td className="text-nowrap text-end">
        <button className="btn btn-sm btn-primary me-1" disabled={!dirty || busy} onClick={save}>Save</button>
        <button className="btn btn-sm btn-outline-danger" onClick={remove} aria-label="Delete category"><i className="bi bi-trash3"></i></button>
      </td>
    </tr>
  );
}

function CategoriesTab({ categories, refresh }) {
  const notify = useToast();
  const blank = { name: '', icon: 'bi-tools', color: '#0B7F70', severity_weight: 5 };
  const [n, setN] = useState(blank);
  async function add(e) {
    e.preventDefault();
    try { await api('/categories', { method: 'POST', body: n }); notify('Category added'); setN(blank); refresh(); }
    catch (err) { notify(err.message, 'danger'); }
  }
  return (
    <>
      <p className="text-muted" style={{ maxWidth: '70ch' }}>The severity weight (1 to 10) is multiplied into every issue's priority score. Give a higher weight to categories that put people at risk.</p>
      <form className="cp-card cp-card-pad mb-4" onSubmit={add} style={{ padding: '1rem' }}>
        <div className="row g-2 align-items-end">
          <div className="col-md-3"><label className="form-label">New category</label><input className="form-control" required placeholder="e.g. Stray cattle on road" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></div>
          <div className="col-md-2"><label className="form-label">Icon</label><select className="form-select" value={n.icon} onChange={(e) => setN({ ...n, icon: e.target.value })}>{ICON_CHOICES.map((i) => <option key={i} value={i}>{i.replace('bi-', '')}</option>)}</select></div>
          <div className="col-md-1"><label className="form-label">Colour</label><input type="color" className="form-control form-control-color w-100" value={n.color} onChange={(e) => setN({ ...n, color: e.target.value })} /></div>
          <div className="col-md-4"><label className="form-label">Severity weight: {n.severity_weight}</label><input type="range" min="1" max="10" className="form-range weight-range" value={n.severity_weight} onChange={(e) => setN({ ...n, severity_weight: Number(e.target.value) })} /></div>
          <div className="col-md-2"><button className="btn btn-ink w-100"><i className="bi bi-plus-lg me-1"></i>Add category</button></div>
        </div>
      </form>
      <div className="cp-card overflow-hidden"><div className="table-responsive">
        <table className="table cp-table align-middle" style={{ cursor: 'default' }}>
          <thead><tr><th></th><th>Name</th><th>Icon</th><th>Colour</th><th>Severity weight</th><th>Issues</th><th></th></tr></thead>
          <tbody>{categories.map((c) => <CategoryRow key={c.id + ':' + c.name + c.severity_weight + c.color + c.icon} cat={c} onSaved={refresh} />)}</tbody>
        </table>
      </div></div>
    </>
  );
}

function EngineTab({ settings, refresh }) {
  const notify = useToast();
  const [s, setS] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [sim, setSim] = useState({ severity: 7, confirmations: 6, age: 14 });
  const [lab, setLab] = useState({
    t1: 'Large pothole on main road near the bus stop', t2: 'Big pothole by the bus stop on the main road causing accidents',
    lat1: 23.0268, lng1: 72.5801, lat2: 23.0272, lng2: 72.5806,
  });
  useEffect(() => setS(settings), [settings]);
  const num = (k) => (e) => setS({ ...s, [k]: e.target.value });

  async function save(e) {
    e.preventDefault(); setBusy(true);
    try { await api('/settings', { method: 'PUT', body: s }); notify('Engine settings saved'); refresh(); }
    catch (err) { notify(err.message, 'danger'); } finally { setBusy(false); }
  }

  const w = { sev: Number(s.w_severity), conf: Number(s.w_confirmations), age: Number(s.w_age), cap: Number(s.age_cap_days) };
  const simScore = sim.severity * w.sev + sim.confirmations * w.conf + Math.min(sim.age, w.cap) * w.age;
  const dist = haversine(+lab.lat1, +lab.lng1, +lab.lat2, +lab.lng2);
  const jac = jaccard(tokenize(lab.t1), tokenize(lab.t2));
  const isDup = dist <= Number(s.duplicate_radius_m) && jac >= Number(s.jaccard_threshold);

  const field = (k, label, hint, step = '1', max) => (
    <div className="col-md-6" key={k}>
      <label className="form-label" htmlFor={k}>{label}</label>
      <input id={k} type="number" min="0" max={max} step={step} className="form-control" value={s[k]} onChange={num(k)} required />
      <div className="form-text">{hint}</div>
    </div>
  );
  return (
    <div className="row g-4">
      <div className="col-lg-5">
        <form className="cp-card cp-card-pad" onSubmit={save}>
          <h2 className="h5 mb-3">Duplicate detection</h2>
          <div className="row g-3 mb-4">
            {field('duplicate_radius_m', 'Search radius (metres)', 'Reports farther apart than this are never merged.')}
            {field('jaccard_threshold', 'Minimum wording match', 'Between 0 and 1. Lower merges more aggressively.', '0.05', 1)}
          </div>
          <h2 className="h5 mb-3">Priority score weights</h2>
          <div className="row g-3 mb-4">
            {field('w_severity', 'Points per severity unit', 'Multiplied by the category weight.', '0.5')}
            {field('w_confirmations', 'Points per confirmation', 'Each unique neighbour who confirms.', '0.5')}
            {field('w_age', 'Points per day open', 'Waiting issues slowly climb the queue.', '0.1')}
            {field('age_cap_days', 'Age cap (days)', 'Age stops adding points after this.')}
          </div>
          <button className="btn btn-primary" disabled={busy}>Save engine settings</button>
        </form>
      </div>

      <div className="col-lg-7 d-grid gap-4 align-content-start">
        <div className="cp-card cp-card-pad">
          <h2 className="h5">Priority simulator</h2>
          <p className="text-muted small">Try values with your unsaved weights to see where an issue would land.</p>
          <div className="row g-3 align-items-center">
            <div className="col-md-4"><label className="form-label">Severity: {sim.severity}</label><input type="range" min="1" max="10" className="form-range weight-range" value={sim.severity} onChange={(e) => setSim({ ...sim, severity: +e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label">Confirmations: {sim.confirmations}</label><input type="range" min="1" max="40" className="form-range weight-range" value={sim.confirmations} onChange={(e) => setSim({ ...sim, confirmations: +e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label">Days open: {sim.age}</label><input type="range" min="0" max="90" className="form-range weight-range" value={sim.age} onChange={(e) => setSim({ ...sim, age: +e.target.value })} /></div>
          </div>
          <div className="d-flex align-items-center gap-3 mt-2">
            <span className="cp-display fs-1 fw-bold" style={{ color: LEVEL_COLORS[levelFor(simScore)] }}>{simScore.toFixed(1)}</span>
            <LevelPill level={levelFor(simScore)} />
            <span className="small text-muted">= {sim.severity}×{w.sev} + {sim.confirmations}×{w.conf} + {Math.min(sim.age, w.cap)}×{w.age}</span>
          </div>
        </div>

        <div className="cp-card cp-card-pad">
          <h2 className="h5">Duplicate lab</h2>
          <p className="text-muted small">Compare two hypothetical reports. Both checks must pass for a merge to be suggested.</p>
          <div className="row g-2">
            <div className="col-md-6"><label className="form-label">Report A</label><textarea className="form-control" rows="2" value={lab.t1} onChange={(e) => setLab({ ...lab, t1: e.target.value })}></textarea>
              <div className="d-flex gap-1 mt-1"><input className="form-control form-control-sm" value={lab.lat1} onChange={(e) => setLab({ ...lab, lat1: e.target.value })} aria-label="Latitude A" /><input className="form-control form-control-sm" value={lab.lng1} onChange={(e) => setLab({ ...lab, lng1: e.target.value })} aria-label="Longitude A" /></div></div>
            <div className="col-md-6"><label className="form-label">Report B</label><textarea className="form-control" rows="2" value={lab.t2} onChange={(e) => setLab({ ...lab, t2: e.target.value })}></textarea>
              <div className="d-flex gap-1 mt-1"><input className="form-control form-control-sm" value={lab.lat2} onChange={(e) => setLab({ ...lab, lat2: e.target.value })} aria-label="Latitude B" /><input className="form-control form-control-sm" value={lab.lng2} onChange={(e) => setLab({ ...lab, lng2: e.target.value })} aria-label="Longitude B" /></div></div>
          </div>
          <div className="d-flex flex-wrap gap-4 align-items-center mt-3">
            <div className="metric">Haversine distance<br /><b>{isFinite(dist) ? dist.toFixed(1) : '–'} m</b> <span className={dist <= s.duplicate_radius_m ? 'text-success' : 'text-danger'}><i className={`bi ${dist <= s.duplicate_radius_m ? 'bi-check-circle' : 'bi-x-circle'}`}></i></span></div>
            <div className="metric">Jaccard index<br /><b>{jac.toFixed(2)}</b> <span className={jac >= s.jaccard_threshold ? 'text-success' : 'text-danger'}><i className={`bi ${jac >= s.jaccard_threshold ? 'bi-check-circle' : 'bi-x-circle'}`}></i></span></div>
            <span className={`pill ${isDup ? 'status-Resolved' : 'status-Rejected'} ms-auto`}>{isDup ? 'Treated as duplicates' : 'Treated as separate issues'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminPage({ admin, setAdmin, issues, categories, settings, refresh, openIssue }) {
  const [tab, setTab] = useState('triage');
  if (!admin) return <AdminLogin onLogin={setAdmin} />;
  const tabs = [['triage', 'Triage queue', 'bi-list-ol'], ['categories', 'Categories and weights', 'bi-tags'], ['engine', 'Engine settings', 'bi-sliders']];
  return (
    <>
      <PageHead title="Admin panel" subtitle={`Signed in as ${admin}. Work the queue from the top, tune severity weights, and adjust how duplicates are detected.`}>
        <button className="btn btn-outline-ink" onClick={() => { sessionStorage.removeItem('cp_token'); sessionStorage.removeItem('cp_admin'); setAdmin(null); }}><i className="bi bi-box-arrow-right me-2"></i>Sign out</button>
      </PageHead>
      <div className="container cp-section-tight">
        <div className="cp-tabs mb-4" role="tablist">
          {tabs.map(([k, l, ic]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}><i className={`bi ${ic} me-2`}></i>{l}</button>)}
        </div>
        {tab === 'triage' && <TriageTab issues={issues} categories={categories} openIssue={openIssue} refresh={refresh} />}
        {tab === 'categories' && <CategoriesTab categories={categories} refresh={refresh} />}
        {tab === 'engine' && settings && <EngineTab settings={settings} refresh={refresh} />}
      </div>
    </>
  );
}

/* =====================================================================
   APP ROOT
   ===================================================================== */
const PAGES = ['home', 'report', 'map', 'issues', 'admin'];

function App() {
  const [page, setPage] = useState(() => (PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home'));
  const [categories, setCategories] = useState([]);
  const [issues, setIssues] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [config, setConfig] = useState({ lat: 23.0225, lng: 72.5714, zoom: 12 });
  const [admin, setAdmin] = useState(() => (sessionStorage.getItem('cp_token') ? sessionStorage.getItem('cp_admin') : null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [openId, setOpenId] = useState(null);

  const notify = useCallback((msg, type = 'success') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [c, i, s, st] = await Promise.all([api('/categories'), api('/issues'), api('/stats'), api('/settings')]);
      setCategories(c); setIssues(i); setStats(s); setSettings(st); setError(null);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    api('/config').then(setConfig).catch(() => {});
    refresh();
    const onHash = () => { const h = location.hash.slice(1); if (PAGES.includes(h)) setPage(h); };
    const onLogout = () => { sessionStorage.removeItem('cp_token'); sessionStorage.removeItem('cp_admin'); setAdmin(null); notify('Your session expired. Please sign in again.', 'warning'); };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('cp-logout', onLogout);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('cp-logout', onLogout); };
  }, []);

  const go = (p) => { location.hash = p; setPage(p); window.scrollTo(0, 0); };
  const openIssue = (id) => setOpenId(id);

  async function confirmIssue(id) {
    try {
      const r = await api(`/issues/${id}/confirm`, { method: 'POST', body: { voter_key: getVoterKey() } });
      notify(r.confirmed ? 'Thanks. Your confirmation raised the priority.' : r.message, r.confirmed ? 'success' : 'warning');
      refresh();
    } catch (e) { notify(e.message, 'danger'); }
  }

  if (loading) return <div className="cp-boot"><div className="cp-pulse-dot"></div><p>Loading CivicPulse…</p></div>;
  if (error && !issues.length) {
    return (
      <div className="cp-boot text-center px-3">
        <i className="bi bi-plug fs-1"></i>
        <h1 className="h3">We cannot reach the server</h1>
        <p style={{ maxWidth: 460 }}>{error} Check that MySQL is running, the schema is imported and the backend is started with <code>npm start</code>.</p>
        <button className="btn btn-primary" onClick={() => { setLoading(true); refresh(); }}>Try again</button>
      </div>
    );
  }

  return (
    <ToastCtx.Provider value={notify}>
      <Navbar page={page} go={go} admin={admin} />
      <main>
        {page === 'home' && <Home go={go} stats={stats} issues={issues} settings={settings} openIssue={openIssue} />}
        {page === 'report' && <ReportPage categories={categories} config={config} settings={settings} refresh={refresh} go={go} openIssue={openIssue} />}
        {page === 'map' && <MapPage issues={issues} categories={categories} config={config} openIssue={openIssue} />}
        {page === 'issues' && <IssuesPage issues={issues} categories={categories} openIssue={openIssue} confirmIssue={confirmIssue} go={go} />}
        {page === 'admin' && <AdminPage admin={admin} setAdmin={setAdmin} issues={issues} categories={categories} settings={settings} refresh={refresh} openIssue={openIssue} />}
      </main>
      <Footer />
      {openId && <IssueDetail id={openId} config={config} admin={admin} onClose={() => setOpenId(null)} refresh={refresh} confirmIssue={confirmIssue} />}
      <div className="cp-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`cp-toast ${t.type}`}>
            <i className={`bi ${t.type === 'success' ? 'bi-check-circle' : 'bi-exclamation-circle'}`}></i><span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
