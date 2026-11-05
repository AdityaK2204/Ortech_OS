import { cumulative } from './geo';

// ---------------------------------------------------------------------------
// Google Earth import (KML / KMZ).
//
// A surveyor marks the route in Google Earth (Add Path, or a recorded GPS
// track) and exports it as .kml or .kmz. We pull every line out of the file
// and let the director pick one, or join them, as the project's route.
//
// Coordinates come out as GeoJSON [lng, lat] pairs, the same shape the route
// is stored in, so nothing downstream changes.
//
// The parser is deliberately regex-based rather than DOMParser-based so it
// runs the same in the browser and in unit tests, and tolerates the namespace
// prefixes (kml:, gx:) that different exporters emit.
// ---------------------------------------------------------------------------

export type Coord = [number, number]; // [lng, lat]

export interface KmlLine {
  name: string;
  coords: Coord[];
  lengthM: number;
}

export interface KmlPoint {
  name: string;
  coord: Coord;
}

export interface KmlContents {
  lines: KmlLine[];
  points: KmlPoint[];
  /** Polygons are not routes; counted only so the UI can say they were skipped. */
  polygons: number;
}

/** Above this many vertices a line is simplified (to ~1 m) before use. */
export const MAX_ROUTE_VERTICES = 1500;
const SIMPLIFY_TOLERANCE_M = 1;

const tag = (name: string) => `(?:[\\w-]+:)?${name}`;
const block = (name: string, flags = 'g') =>
  new RegExp(`<${tag(name)}\\b[^>]*>([\\s\\S]*?)<\\/${tag(name)}>`, flags);

function decodeText(s: string): string {
  return s
    // CDATA is literal text: escape it so the tag-stripping below leaves it alone.
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t: string) =>
      t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    )
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')
    .trim();
}

function validCoord(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** Drop consecutive duplicates (Google Earth often repeats the last vertex). */
function dedupe(coords: Coord[]): Coord[] {
  const out: Coord[] = [];
  for (const c of coords) {
    const p = out[out.length - 1];
    if (!p || p[0] !== c[0] || p[1] !== c[1]) out.push(c);
  }
  return out;
}

/** `<coordinates>lng,lat[,alt] lng,lat[,alt] …</coordinates>` */
export function parseCoordinateList(text: string): Coord[] {
  const out: Coord[] = [];
  for (const tuple of decodeText(text).split(/\s+/)) {
    if (!tuple) continue;
    const [lng, lat] = tuple.split(',').map(Number);
    if (validCoord(lng, lat)) out.push([lng, lat]);
  }
  return dedupe(out);
}

/** `<gx:coord>lng lat alt</gx:coord>` (Google Earth GPS tracks). */
function parseTrack(text: string): Coord[] {
  const out: Coord[] = [];
  for (const m of text.matchAll(block('coord'))) {
    const [lng, lat] = decodeText(m[1]).split(/\s+/).map(Number);
    if (validCoord(lng, lat)) out.push([lng, lat]);
  }
  return dedupe(out);
}

export function lineLength(coords: Coord[]): number {
  return cumulative(coords.map(([lng, lat]) => ({ lat, lng }))).total;
}

function makeLine(name: string, coords: Coord[]): KmlLine {
  return { name, coords, lengthM: lineLength(coords) };
}

export function parseKml(xml: string): KmlContents {
  const text = xml.replace(/<!--[\s\S]*?-->/g, '');
  const lines: KmlLine[] = [];
  const points: KmlPoint[] = [];
  let polygons = 0;
  let unnamed = 0;

  for (const pm of text.matchAll(block('Placemark'))) {
    let body = pm[1];
    const nameMatch = body.match(block('name', ''));
    const name = (nameMatch && decodeText(nameMatch[1])) || `Untitled ${++unnamed}`;

    // Polygons first, so their rings are not mistaken for routes.
    const polys = [...body.matchAll(block('Polygon'))];
    polygons += polys.length;
    for (const p of polys) body = body.replace(p[0], '');

    const found: Coord[][] = [];
    for (const ls of body.matchAll(block('LineString'))) {
      const c = ls[1].match(block('coordinates', ''));
      if (c) found.push(parseCoordinateList(c[1]));
    }
    for (const tr of body.matchAll(block('Track'))) found.push(parseTrack(tr[1]));

    const usable = found.filter((c) => c.length >= 2);
    usable.forEach((coords, i) =>
      lines.push(makeLine(usable.length > 1 ? `${name} (part ${i + 1})` : name, coords))
    );

    if (found.length === 0) {
      for (const pt of body.matchAll(block('Point'))) {
        const c = pt[1].match(block('coordinates', ''));
        const coord = c && parseCoordinateList(c[1])[0];
        if (coord) points.push({ name, coord });
      }
    }
  }

  return { lines, points, polygons };
}

const dist = (a: Coord, b: Coord) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Join several lines into one route, in file order, flipping each next piece
 * when its far end is nearer to where the route currently ends.
 */
export function joinLines(lines: Coord[][]): Coord[] {
  const parts = lines.filter((l) => l.length >= 2);
  if (parts.length === 0) return [];
  let out = [...parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const next = parts[i];
    const head = out[0];
    const tail = out[out.length - 1];
    const options: { d: number; build: () => Coord[] }[] = [
      { d: dist(tail, next[0]), build: () => [...out, ...next] },
      { d: dist(tail, next[next.length - 1]), build: () => [...out, ...[...next].reverse()] },
    ];
    if (i === 1) {
      // The first piece's direction is arbitrary too.
      const rev = [...out].reverse();
      options.push(
        { d: dist(head, next[0]), build: () => [...rev, ...next] },
        { d: dist(head, next[next.length - 1]), build: () => [...rev, ...[...next].reverse()] }
      );
    }
    out = options.reduce((a, b) => (b.d < a.d ? b : a)).build();
  }
  return dedupe(out);
}

/**
 * Douglas–Peucker in local metres. Keeps long recorded GPS tracks light
 * without changing the route's shape or length by more than ~1 m.
 */
export function simplify(coords: Coord[], toleranceM = SIMPLIFY_TOLERANCE_M): Coord[] {
  if (coords.length <= 2) return coords;
  const lat0 = (coords.reduce((s, c) => s + c[1], 0) / coords.length) * (Math.PI / 180);
  const kx = 111_320 * Math.cos(lat0);
  const ky = 110_540;
  const xy = coords.map(([lng, lat]) => [lng * kx, lat * ky]);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1;
    let bestD = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > 0 && bestD > toleranceM) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

/** Final clean-up before a coordinate list becomes the project route. */
export function prepareRoute(coords: Coord[]): Coord[] {
  const c = dedupe(coords);
  return c.length > MAX_ROUTE_VERTICES ? simplify(c) : c;
}

export interface GoogleEarthFile {
  source: 'kml' | 'kmz';
  fileName: string;
  contents: KmlContents;
}

const isZip = (b: Uint8Array) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b;

/** Read the KML text out of raw .kml or .kmz bytes. */
export async function kmlTextFromBytes(bytes: Uint8Array): Promise<{ text: string; zipped: boolean }> {
  if (!isZip(bytes)) return { text: new TextDecoder().decode(bytes), zipped: false };
  const { unzipSync } = await import('fflate');
  const files = unzipSync(bytes, { filter: (f) => f.name.toLowerCase().endsWith('.kml') });
  const names = Object.keys(files);
  if (names.length === 0) throw new Error('This KMZ file has no KML inside it.');
  // Google Earth names the main document doc.kml; otherwise take the top-level one.
  const main =
    names.find((n) => n.toLowerCase() === 'doc.kml') ??
    names.sort((a, b) => a.split('/').length - b.split('/').length)[0];
  return { text: new TextDecoder().decode(files[main]), zipped: true };
}

export async function readGoogleEarthFile(file: File): Promise<GoogleEarthFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { text, zipped } = await kmlTextFromBytes(bytes);
  if (!/<(?:[\w-]+:)?kml\b/i.test(text))
    throw new Error('This does not look like a Google Earth file. Export the route as KML or KMZ.');
  return { source: zipped ? 'kmz' : 'kml', fileName: file.name, contents: parseKml(text) };
}
