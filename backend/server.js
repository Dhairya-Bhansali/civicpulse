const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Make async route handlers forward errors to the error middleware (Express 4)
const wrap = (router) => {
  router.stack.forEach((layer) => {
    if (layer.route) {
      layer.route.stack.forEach((l) => {
        const fn = l.handle;
        if (fn.length <= 3) l.handle = (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
      });
    }
  });
  return router;
};

app.use('/api/auth', wrap(require('./routes/auth')));
app.use('/api/categories', wrap(require('./routes/categories')));
app.use('/api/issues', wrap(require('./routes/issues')));
app.use('/api/settings', wrap(require('./routes/settings')));
app.use('/api/stats', wrap(require('./routes/stats')));

app.get('/api/config', (req, res) => {
  res.json({
    lat: Number(process.env.MAP_LAT || 23.0225),
    lng: Number(process.env.MAP_LNG || 72.5714),
    zoom: Number(process.env.MAP_ZOOM || 12),
  });
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (e) {
    res.status(500).json({ ok: false, database: e.message });
  }
});

// Serve the React + Bootstrap frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`CivicPulse running at http://localhost:${PORT}`));
