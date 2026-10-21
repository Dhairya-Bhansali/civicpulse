const router = require('express').Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { haversine, boundingBox, tokenize, jaccard } = require('../utils/geo');
const { getSettings, computePriority } = require('../utils/priority');

const STATUSES = ['Reported', 'Acknowledged', 'In Progress', 'Resolved', 'Rejected'];
const ISSUE_SELECT = `
  SELECT i.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
         c.severity_weight
    FROM issues i JOIN categories c ON c.id = i.category_id`;

const decorate = (rows, settings) =>
  rows.map((r) => ({
    ...r,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    ...computePriority(r, settings),
  }));

/**
 * Duplicate-detection engine.
 * 1. SQL bounding box narrows candidates to the same category & open issues nearby.
 * 2. Haversine gives the exact distance in metres -> must be within the radius.
 * 3. Jaccard index on title+description tokens -> must reach the similarity threshold.
 * 4. A combined confidence (40% proximity, 60% text) ranks the matches.
 */
async function findDuplicates({ lat, lon, title, description, category_id }, settings) {
  const radius = settings.duplicate_radius_m;
  const box = boundingBox(lat, lon, radius);
  const [rows] = await pool.query(
    `${ISSUE_SELECT}
      WHERE i.category_id = ? AND i.status NOT IN ('Resolved','Rejected')
        AND i.latitude BETWEEN ? AND ? AND i.longitude BETWEEN ? AND ?`,
    [category_id, box.minLat, box.maxLat, box.minLon, box.maxLon]
  );
  const newTokens = tokenize(`${title} ${description}`);
  const matches = [];
  for (const row of rows) {
    const distance = haversine(lat, lon, Number(row.latitude), Number(row.longitude));
    if (distance > radius) continue;
    const similarity = jaccard(newTokens, tokenize(`${row.title} ${row.description}`));
    if (similarity < settings.jaccard_threshold) continue;
    const proximity = 1 - distance / radius;
    matches.push({
      ...decorate([row], settings)[0],
      distance_m: Math.round(distance * 10) / 10,
      text_similarity: Math.round(similarity * 1000) / 1000,
      confidence: Math.round((0.4 * proximity + 0.6 * similarity) * 1000) / 1000,
    });
  }
  return matches.sort((a, b) => b.confidence - a.confidence);
}

function parseReport(body) {
  const lat = Number(body.latitude);
  const lon = Number(body.longitude);
  const category_id = Number(body.category_id);
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  if (!title || title.length < 4) return { error: 'Add a short title (at least 4 characters)' };
  if (!description || description.length < 10) return { error: 'Describe the problem in at least 10 characters' };
  if (!Number.isInteger(category_id) || category_id <= 0) return { error: 'Choose a category' };
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return { error: 'Pick the issue location on the map' };
  return {
    value: {
      lat, lon, category_id, title, description,
      address: String(body.address || '').trim().slice(0, 255) || null,
      reporter_name: String(body.reporter_name || '').trim().slice(0, 100) || 'Anonymous',
      voter_key: String(body.voter_key || '').slice(0, 64) || null,
    },
  };
}

// ---------- list (with server-side filters) ----------
router.get('/', async (req, res) => {
  const { status, category_id, q } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('i.status = ?'); params.push(status); }
  if (category_id) { where.push('i.category_id = ?'); params.push(Number(category_id)); }
  if (q) {
    where.push('(i.title LIKE ? OR i.description LIKE ? OR i.address LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const [rows] = await pool.query(
    `${ISSUE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY i.created_at DESC`,
    params
  );
  const settings = await getSettings();
  const issues = decorate(rows, settings).sort((a, b) => b.priority_score - a.priority_score);
  res.json(issues);
});

// ---------- live duplicate check (used while typing the report form) ----------
router.post('/check-duplicates', async (req, res) => {
  const lat = Number(req.body.latitude);
  const lon = Number(req.body.longitude);
  const category_id = Number(req.body.category_id);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !category_id) return res.json({ matches: [] });
  const settings = await getSettings();
  const matches = await findDuplicates(
    { lat, lon, category_id, title: req.body.title || '', description: req.body.description || '' },
    settings
  );
  res.json({ matches, radius_m: settings.duplicate_radius_m, threshold: settings.jaccard_threshold });
});

// ---------- single issue with timeline ----------
router.get('/:id', async (req, res) => {
  const [rows] = await pool.query(`${ISSUE_SELECT} WHERE i.id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Issue not found' });
  const settings = await getSettings();
  const [history] = await pool.query('SELECT * FROM status_history WHERE issue_id = ? ORDER BY changed_at DESC, id DESC', [req.params.id]);
  const [reports] = await pool.query('SELECT * FROM issue_reports WHERE issue_id = ? ORDER BY created_at DESC, id DESC', [req.params.id]);
  res.json({ ...decorate(rows, settings)[0], history, reports });
});

// ---------- create (duplicate-aware) ----------
router.post('/', async (req, res) => {
  const parsed = parseReport(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const r = parsed.value;
  const settings = await getSettings();

  if (!req.body.force) {
    const matches = await findDuplicates(r, settings);
    if (matches.length) {
      return res.status(409).json({
        duplicate: true,
        message: 'Similar open issues were found nearby',
        matches,
        radius_m: settings.duplicate_radius_m,
        threshold: settings.jaccard_threshold,
      });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO issues (title, description, category_id, latitude, longitude, address, reporter_name)
       VALUES (?,?,?,?,?,?,?)`,
      [r.title, r.description, r.category_id, r.lat, r.lon, r.address, r.reporter_name]
    );
    const id = ins.insertId;
    await conn.query(
      `INSERT INTO issue_reports (issue_id, reporter_name, description, latitude, longitude, distance_from_issue_m, text_similarity)
       VALUES (?,?,?,?,?,0,1)`,
      [id, r.reporter_name, r.description, r.lat, r.lon]
    );
    if (r.voter_key) await conn.query('INSERT IGNORE INTO confirmations (issue_id, voter_key) VALUES (?,?)', [id, r.voter_key]);
    await conn.query('INSERT INTO status_history (issue_id, old_status, new_status, note) VALUES (?,NULL,?,?)', [id, 'Reported', 'Issue reported by a citizen']);
    await conn.commit();
    res.status(201).json({ merged: false, id });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

// ---------- merge a new report into an existing issue ----------
router.post('/:id/merge', async (req, res) => {
  const lat = Number(req.body.latitude);
  const lon = Number(req.body.longitude);
  const [rows] = await pool.query('SELECT * FROM issues WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Issue not found' });
  const issue = rows[0];
  if (['Resolved', 'Rejected'].includes(issue.status))
    return res.status(409).json({ error: 'This issue is already closed' });

  const distance = Number.isFinite(lat) && Number.isFinite(lon)
    ? haversine(lat, lon, Number(issue.latitude), Number(issue.longitude)) : 0;
  const similarity = jaccard(
    tokenize(`${req.body.title || ''} ${req.body.description || ''}`),
    tokenize(`${issue.title} ${issue.description}`)
  );
  const voter = String(req.body.voter_key || '').slice(0, 64) || null;
  const reporter = String(req.body.reporter_name || '').trim().slice(0, 100) || 'Anonymous';

  const conn = await pool.getConnection();
  let confirmed = false;
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO issue_reports (issue_id, reporter_name, description, latitude, longitude, distance_from_issue_m, text_similarity)
       VALUES (?,?,?,?,?,?,?)`,
      [issue.id, reporter, String(req.body.description || '').trim() || '(confirmed without extra details)',
       Number.isFinite(lat) ? lat : issue.latitude, Number.isFinite(lon) ? lon : issue.longitude,
       Math.round(distance * 10) / 10, Math.round(similarity * 1000) / 1000]
    );
    if (voter) {
      const [c] = await conn.query('INSERT IGNORE INTO confirmations (issue_id, voter_key) VALUES (?,?)', [issue.id, voter]);
      confirmed = c.affectedRows > 0;
    } else {
      confirmed = true;
    }
    await conn.query(
      'UPDATE issues SET report_count = report_count + 1, confirmations = confirmations + ? WHERE id = ?',
      [confirmed ? 1 : 0, issue.id]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  res.json({ merged: true, id: issue.id, confirmed });
});

// ---------- community confirmation ("me too") ----------
router.post('/:id/confirm', async (req, res) => {
  const voter = String(req.body.voter_key || '').slice(0, 64);
  if (!voter) return res.status(400).json({ error: 'Missing voter key' });
  const [rows] = await pool.query('SELECT status FROM issues WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Issue not found' });
  if (['Resolved', 'Rejected'].includes(rows[0].status)) return res.status(409).json({ error: 'This issue is already closed' });
  const [c] = await pool.query('INSERT IGNORE INTO confirmations (issue_id, voter_key) VALUES (?,?)', [req.params.id, voter]);
  if (!c.affectedRows) return res.json({ confirmed: false, message: 'You already confirmed this issue' });
  await pool.query('UPDATE issues SET confirmations = confirmations + 1 WHERE id = ?', [req.params.id]);
  res.json({ confirmed: true });
});

// ---------- status workflow (admin) ----------
router.patch('/:id/status', requireAdmin, async (req, res) => {
  const { status, note } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const [rows] = await pool.query('SELECT status FROM issues WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Issue not found' });
  const old = rows[0].status;
  if (old === status) return res.json({ updated: false });
  await pool.query(
    'UPDATE issues SET status = ?, resolved_at = ? WHERE id = ?',
    [status, status === 'Resolved' ? new Date() : null, req.params.id]
  );
  await pool.query(
    'INSERT INTO status_history (issue_id, old_status, new_status, note, changed_by) VALUES (?,?,?,?,?)',
    [req.params.id, old, status, String(note || '').slice(0, 255) || null, req.admin.username]
  );
  res.json({ updated: true });
});

module.exports = router;
