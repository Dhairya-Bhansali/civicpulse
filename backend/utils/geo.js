/**
 * Geo + text similarity helpers used by the duplicate-detection engine.
 */
const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Haversine formula - great-circle distance between two lat/lng points (metres).
 *   a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
 *   d = 2R · asin(√a)
 */
function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Cheap SQL pre-filter: a lat/lng box that fully contains the search circle. */
function boundingBox(lat, lon, radiusM) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.max(0.01, Math.cos(toRad(lat))));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'has', 'have', 'had', 'with', 'this', 'that', 'from',
  'near', 'there', 'very', 'been', 'will', 'its', 'not', 'but', 'you', 'our', 'out', 'can', 'since',
  'just', 'again', 'please', 'also', 'into', 'over', 'which', 'when', 'than', 'them', 'they',
]);

/** Lower-case, strip punctuation, drop stop-words, light plural stemming -> Set of tokens. */
function tokenize(text) {
  const tokens = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
  return new Set(tokens);
}

/**
 * Jaccard index - |A ∩ B| / |A ∪ B|, from 0 (nothing shared) to 1 (identical word sets).
 */
function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

module.exports = { haversine, boundingBox, tokenize, jaccard };
