const jwt = require('jsonwebtoken');

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';

function signAdminToken(username) {
  return jwt.sign({ role: 'admin', username }, SECRET(), { expiresIn: '12h' });
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Admin login required' });
  try {
    const payload = jwt.verify(token, SECRET());
    if (payload.role !== 'admin') throw new Error('not admin');
    req.admin = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

module.exports = { signAdminToken, requireAdmin };
