const router = require('express').Router();
const { signAdminToken } = require('../middleware/auth');

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = process.env.ADMIN_USER || 'admin';
  const p = process.env.ADMIN_PASSWORD || 'admin123';
  if (username === u && password === p) {
    return res.json({ token: signAdminToken(username), username });
  }
  res.status(401).json({ error: 'Incorrect username or password' });
});

module.exports = router;
