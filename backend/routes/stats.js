const router = require('express').Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  const [[totals]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status NOT IN ('Resolved','Rejected')) AS open_count,
            SUM(status = 'Resolved') AS resolved,
            COALESCE(SUM(report_count - 1), 0) AS duplicates_merged,
            COALESCE(SUM(confirmations), 0) AS total_confirmations
       FROM issues`
  );
  const [byStatus] = await pool.query('SELECT status, COUNT(*) AS count FROM issues GROUP BY status');
  const [byCategory] = await pool.query(
    `SELECT c.name, c.color, c.icon, COUNT(i.id) AS count
       FROM categories c LEFT JOIN issues i ON i.category_id = c.id
      GROUP BY c.id ORDER BY count DESC, c.name`
  );
  const [[avg]] = await pool.query(
    `SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)) AS hours FROM issues WHERE status='Resolved' AND resolved_at IS NOT NULL`
  );
  res.json({
    total: Number(totals.total),
    open: Number(totals.open_count || 0),
    resolved: Number(totals.resolved || 0),
    duplicates_merged: Number(totals.duplicates_merged),
    total_confirmations: Number(totals.total_confirmations),
    avg_resolution_hours: avg.hours === null ? null : Math.round(Number(avg.hours)),
    by_status: byStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
    by_category: byCategory.map((r) => ({ ...r, count: Number(r.count) })),
  });
});

module.exports = router;
