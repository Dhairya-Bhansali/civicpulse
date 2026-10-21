const router = require('express').Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { getSettings, DEFAULT_SETTINGS } = require('../utils/priority');

router.get('/', async (req, res) => {
  res.json(await getSettings());
});

router.put('/', requireAdmin, async (req, res) => {
  const body = req.body || {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (body[key] === undefined) continue;
    const val = Number(body[key]);
    if (!Number.isFinite(val) || val < 0) return res.status(400).json({ error: `Invalid value for ${key}` });
    if (key === 'jaccard_threshold' && val > 1) return res.status(400).json({ error: 'Text similarity must be between 0 and 1' });
    await pool.query(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
      [key, val]
    );
  }
  res.json(await getSettings());
});

module.exports = router;
