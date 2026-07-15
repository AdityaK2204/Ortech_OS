import type { LatLng, RouteGeometry } from '../types';

// ---------------------------------------------------------------------------
// Geometry helpers. The app measures work in CHAINAGE metres (0 → total), while
// a route is a GeoJSON LineString. We convert between the two by working in
// *fractions* of the route's geometric length, so the declared project length
// need not equal the hand-drawn geometry's real length.
// ---------------------------------------------------------------------------

/** GeoJSON [lng,lat] pairs → {lat,lng} path used everywhere else. */
export function toLatLngPath(route: RouteGeometry): LatLng[] {
  return route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
}

const R = 6_371_000; // earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance between two coordinates, in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Cumulative distance at each vertex + total geometric length. */
export function cumulative(path: LatLng[]): { cum: number[]; total: number } {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + haversine(path[i - 1], path[i]));
  }
  return { cum, total: cum[cum.length - 1] || 0 };
}

function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Coordinate at fraction `f` (0–1) of the route's geometric length. */
export function interpAtFraction(path: LatLng[], f: number): LatLng {
  if (path.length === 0) return { lat: 0, lng: 0 };
  if (path.length === 1) return path[0];
  const { cum, total } = cumulative(path);
  const target = clamp01(f) * total;
  for (let i = 1; i < path.length; i++) {
    if (target <= cum[i]) {
      const segLen = cum[i] - cum[i - 1] || 1;
      return lerp(path[i - 1], path[i], (target - cum[i - 1]) / segLen);
    }
  }
  return path[path.length - 1];
}

/** Sub-polyline between two fractions, with interpolated endpoints. */
export function sliceByFraction(path: LatLng[], f0: number, f1: number): LatLng[] {
  const lo = clamp01(Math.min(f0, f1));
  const hi = clamp01(Math.max(f0, f1));
  if (path.length < 2 || hi - lo < 1e-9) return [];
  const { cum, total } = cumulative(path);
  const dLo = lo * total;
  const dHi = hi * total;
  const out: LatLng[] = [interpAtFraction(path, lo)];
  for (let i = 0; i < path.length; i++) {
    if (cum[i] > dLo && cum[i] < dHi) out.push(path[i]);
  }
  out.push(interpAtFraction(path, hi));
  return out;
}

/** Project a clicked coordinate onto the route → nearest chainage in metres. */
export function nearestChainage(path: LatLng[], click: LatLng, totalM: number): number {
  if (path.length < 2) return 0;
  const { cum, total } = cumulative(path);
  let best = { dist: Infinity, along: 0 };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    // approximate planar projection (fine at city scale)
    const ax = a.lng, ay = a.lat, bx = b.lng, by = b.lat;
    const dx = bx - ax, dy = by - ay;
    const segLenSq = dx * dx + dy * dy || 1e-12;
    let t = ((click.lng - ax) * dx + (click.lat - ay) * dy) / segLenSq;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t, py = ay + dy * t;
    const d = (click.lng - px) ** 2 + (click.lat - py) ** 2;
    if (d < best.dist) {
      const along = cum[i - 1] + (cum[i] - cum[i - 1]) * t;
      best = { dist: d, along };
    }
  }
  return total === 0 ? 0 : (best.along / total) * totalM;
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function boundsOf(path: LatLng[]): Bounds {
  const lats = path.map((p) => p.lat);
  const lngs = path.map((p) => p.lng);
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}

/** Midpoint of a route (used for the Mission Map site marker). */
export function centroidOf(route: RouteGeometry): LatLng {
  return interpAtFraction(toLatLngPath(route), 0.5);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
