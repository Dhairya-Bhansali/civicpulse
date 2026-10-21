# CivicPulse – Intelligent Civic Issue Reporting, Prioritization & Resolution Platform

A full-stack civic-tech platform where citizens report infrastructure problems (potholes, broken streetlights,
garbage overflow…) with a map pin. A **duplicate-detection engine** (Haversine distance + Jaccard text similarity)
consolidates repeated reports, and a **dynamic priority score** (community confirmations + category severity + issue age)
helps municipal officials work the most urgent problems first.

| Layer | Technology |
|---|---|
| Frontend document | HTML5 (`frontend/index.html`) |
| UI rendering | React 18 (in-browser JSX via Babel – no build step) |
| Responsive styling | Bootstrap 5.3 + Bootstrap Icons + custom design tokens |
| Map | Leaflet + OpenStreetMap tiles |
| Backend | Node.js + Express (REST API, JWT admin auth) |
| Database | MySQL 8 (`mysql2` driver) |

## Run it

1. **Install** Node.js 18+ and MySQL 8+.
2. **Create the database and sample data**
   ```bash
   mysql -u root -p < database/schema.sql
   ```
3. **Configure and start the backend**
   ```bash
   cd backend
   cp .env.example .env        # then edit DB_PASSWORD, ADMIN_PASSWORD, JWT_SECRET, MAP_LAT/MAP_LNG
   npm install
   npm start
   ```
4. Open **http://localhost:5000** (Express serves the React frontend too).
   Admin login: the `ADMIN_USER` / `ADMIN_PASSWORD` from `.env` (default `admin` / `admin123`).

> The browser needs internet access for the CDN libraries (React, Bootstrap, Leaflet) and map tiles.

## Concept → where it lives

| Concept | Implementation |
|---|---|
| Location-tagged reporting | `ReportPage` in `app.jsx` – click-to-pin Leaflet map, "use my location" button; `POST /api/issues` |
| Haversine proximity | `backend/utils/geo.js → haversine()`; SQL bounding box (`idx_geo`) pre-filters candidates |
| Jaccard text similarity | `backend/utils/geo.js → tokenize(), jaccard()` (stop-word removal + light stemming) |
| Duplicate consolidation | `findDuplicates()` in `routes/issues.js`: same category, open status, within radius **and** ≥ threshold. Live preview while typing, a confirmation dialog on submit (`409`), and `POST /api/issues/:id/merge` |
| Community confirmations | `POST /api/issues/:id/confirm`; one vote per browser per issue (`confirmations` table, unique key) |
| Dynamic priority score | `backend/utils/priority.js → computePriority()` – `w₁·severity + w₂·confirmations + w₃·min(age, cap)`, recomputed on every read; closed issues score 0 |
| Sortable official dashboard | `IssueTable` – click any column header; filters by status, category, priority level, free-text search |
| Interactive map | `MapPage` – pins coloured by priority, icon by category, side list, click for details |
| Status-tracking workflow | Reported → Acknowledged → In Progress → Resolved / Rejected, with a full `status_history` timeline and notes |
| Admin panel | Triage queue, category CRUD with **severity weights (1–10)**, engine settings, a priority simulator and a duplicate lab |

## REST API

| Method & path | Purpose | Auth |
|---|---|---|
| `GET /api/issues` | All issues with priority score, level and breakdown | – |
| `GET /api/issues/:id` | One issue + status history + merged reports | – |
| `POST /api/issues/check-duplicates` | Nearby duplicate candidates (live preview) | – |
| `POST /api/issues` | Report an issue (returns `409` with matches if duplicates exist; send `force:true` to override) | – |
| `POST /api/issues/:id/merge` | Add a report to an existing issue | – |
| `POST /api/issues/:id/confirm` | Community confirmation | – |
| `PATCH /api/issues/:id/status` | Move an issue through the workflow | Admin |
| `GET/POST/PUT/DELETE /api/categories` | Categories and severity weights | Writes: Admin |
| `GET/PUT /api/settings` | Radius, similarity threshold, score weights | Writes: Admin |
| `GET /api/stats` | Dashboard statistics | – |
| `POST /api/auth/login` | Admin JWT | – |

## Database (MySQL)

`categories` · `issues` · `issue_reports` (every raw report incl. merged duplicates, with its Haversine distance and Jaccard score) ·
`confirmations` · `status_history` · `settings`

## Try the duplicate engine (2-minute demo)

1. Open **Report an issue**, choose **Pothole**.
2. Title: *Big pothole near the bus stop*, description: *Large pothole on the main road by the bus stop*.
3. Click the map within about 100 m of the first seeded pothole (Main Road, near City Bus Stop). If your map centre differs from the seed data, adjust `MAP_LAT` / `MAP_LNG` or edit the coordinates in `schema.sql`.
4. A yellow "may already be reported nearby" panel appears with the **distance (Haversine)**, **wording match (Jaccard)** and **confidence**. Choose *Same issue, add my report* and watch the confirmations and priority rise.
5. Log in under **Official login → Engine settings** and use the **Duplicate lab** to see how the radius and threshold change the outcome.

## Project structure

```
civicpulse/
├── database/schema.sql          # tables, indexes, sample data
├── backend/
│   ├── server.js                # Express app, static hosting, error handling
│   ├── db.js                    # MySQL pool
│   ├── middleware/auth.js       # JWT admin guard
│   ├── utils/geo.js             # Haversine, tokenizer, Jaccard
│   ├── utils/priority.js        # priority score + settings loader
│   └── routes/                  # issues, categories, settings, stats, auth
└── frontend/
    ├── index.html               # HTML document (Bootstrap, React, Leaflet via CDN)
    ├── css/style.css            # design tokens + Bootstrap overrides
    └── js/app.jsx               # React components
```
