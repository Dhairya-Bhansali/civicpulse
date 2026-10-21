const router = require('express').Router();
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

const clampWeight = (w) => Math.min(10, Math.max(1, Number(w) || 1));

router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, (SELECT COUNT(*) FROM issues i WHERE i.category_id = c.id) AS issue_count
       FROM categories c ORDER BY c.severity_weight DESC, c.name`
  );
  res.json(rows);
});

router.post('/', requireAdmin, async (req, res) => {
  const { name, icon = 'bi-exclamation-triangle', color = '#0F9D8A', severity_weight } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Category name is required' });
  try {
    const [r] = await pool.query(
      'INSERT INTO categories (name, icon, color, severity_weight) VALUES (?,?,?,?)',
      [String(name).trim(), icon, color, clampWeight(severity_weight)]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A category with this name already exists' });
    throw e;
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { name, icon, color, severity_weight } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Category name is required' });
  try {
    const [r] = await pool.query(
      'UPDATE categories SET name=?, icon=?, color=?, severity_weight=? WHERE id=?',
      [String(name).trim(), icon, color, clampWeight(severity_weight), req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Category not found' });
    res.json({ updated: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A category with this name already exists' });
    throw e;
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM categories WHERE id=?', [req.params.id]);
    res.json({ deleted: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2')
      return res.status(409).json({ error: 'This category still has issues linked to it and cannot be deleted' });
    throw e;
  }
});

module.exports = router;
