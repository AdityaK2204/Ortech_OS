import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  joinLines,
  kmlTextFromBytes,
  lineLength,
  MAX_ROUTE_VERTICES,
  parseCoordinateList,
  parseKml,
  prepareRoute,
  simplify,
  type Coord,
} from '../kml';

// A path drawn in Google Earth Pro ("Add Path"), exported as KML.
const GOOGLE_EARTH_PATH = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
  <name>ORR Phase 4.kml</name>
  <Folder>
    <name>Survey</name>
    <Placemark>
      <name>ORR &amp; Whitefield route</name>
      <styleUrl>#line</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          77.7000,12.9700,0 77.7010,12.9700,0 77.7010,12.9700,0
          77.7020,12.9705,0
        </coordinates>
      </LineString>
    </Placemark>
    <Placemark>
      <name>Start chamber</name>
      <Point><coordinates>77.7000,12.9700,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Site boundary</name>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        77.69,12.96,0 77.71,12.96,0 77.71,12.98,0 77.69,12.96,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>
  </Folder>
</Document>
</kml>`;

describe('parseKml', () => {
  it('reads a Google Earth path, ignoring pins and polygons', () => {
    const k = parseKml(GOOGLE_EARTH_PATH);
    expect(k.lines).toHaveLength(1);
    expect(k.lines[0].name).toBe('ORR & Whitefield route');
    // duplicate vertex dropped, altitude ignored, [lng, lat] order kept
    expect(k.lines[0].coords).toEqual([
      [77.7, 12.97],
      [77.701, 12.97],
      [77.702, 12.9705],
    ]);
    expect(k.lines[0].lengthM).toBeGreaterThan(200);
    expect(k.lines[0].lengthM).toBeLessThan(240);
    expect(k.points.map((p) => p.name)).toEqual(["Start chamber"]); // used only when a file has no lines
    expect(k.polygons).toBe(1);
  });

  it('handles namespace prefixes, CDATA names and MultiGeometry', () => {
    const xml = `<kml:kml xmlns:kml="http://www.opengis.net/kml/2.2"><kml:Document>
      <kml:Placemark><kml:name><![CDATA[Ring <A>]]></kml:name><kml:MultiGeometry>
        <kml:LineString><kml:coordinates>1,1 1,2</kml:coordinates></kml:LineString>
        <kml:LineString><kml:coordinates>1,2 1,3</kml:coordinates></kml:LineString>
      </kml:MultiGeometry></kml:Placemark></kml:Document></kml:kml>`;
    const k = parseKml(xml);
    expect(k.lines.map((l) => l.name)).toEqual(['Ring <A> (part 1)', 'Ring <A> (part 2)']);
  });

  it('reads recorded GPS tracks (gx:Track)', () => {
    const xml = `<kml><Placemark><name>Walk</name><gx:Track>
      <when>2026-11-05T10:00:00Z</when><gx:coord>77.1 12.1 900</gx:coord>
      <when>2026-11-05T10:01:00Z</when><gx:coord>77.2 12.1 900</gx:coord>
    </gx:Track></Placemark></kml>`;
    expect(parseKml(xml).lines[0].coords).toEqual([
      [77.1, 12.1],
      [77.2, 12.1],
    ]);
  });

  it('collects pins when the file has no lines', () => {
    const xml = `<kml><Placemark><name>P1</name><Point><coordinates>77,12</coordinates></Point></Placemark>
      <Placemark><name>P2</name><Point><coordinates>77.01,12</coordinates></Point></Placemark></kml>`;
    const k = parseKml(xml);
    expect(k.lines).toHaveLength(0);
    expect(k.points.map((p) => p.name)).toEqual(['P1', 'P2']);
  });

  it('skips junk coordinates', () => {
    expect(parseCoordinateList('abc 200,10 10,95 10,10,5 ')).toEqual([[10, 10]]);
  });
});

describe('joinLines', () => {
  it('joins pieces end to end, flipping ones drawn backwards', () => {
    const a: Coord[] = [[0, 0], [0, 1]];
    const b: Coord[] = [[0, 2], [0, 1]]; // drawn in the opposite direction
    const c: Coord[] = [[0, 2], [0, 3]];
    expect(joinLines([a, b, c])).toEqual([[0, 0], [0, 1], [0, 2], [0, 3]]);
  });

  it('can flip the first piece too', () => {
    const a: Coord[] = [[0, 1], [0, 0]];
    const b: Coord[] = [[0, 1], [0, 2]];
    expect(joinLines([a, b])).toEqual([[0, 0], [0, 1], [0, 2]]);
  });
});

describe('simplify / prepareRoute', () => {
  const dense: Coord[] = Array.from({ length: 5000 }, (_, i) => [
    77 + i * 0.00001,
    12 + Math.sin(i / 400) * 0.002,
  ]);

  it('thins long tracks without changing their length noticeably', () => {
    const out = prepareRoute(dense);
    expect(out.length).toBeLessThanOrEqual(MAX_ROUTE_VERTICES);
    expect(out[0]).toEqual(dense[0]);
    expect(out[out.length - 1]).toEqual(dense[dense.length - 1]);
    expect(Math.abs(lineLength(out) - lineLength(dense))).toBeLessThan(5);
  });

  it('leaves short routes untouched', () => {
    const short = dense.slice(0, 50);
    expect(prepareRoute(short)).toEqual(short);
    expect(simplify(short.slice(0, 2))).toEqual(short.slice(0, 2));
  });
});

describe('kmlTextFromBytes', () => {
  it('reads plain KML', async () => {
    const r = await kmlTextFromBytes(strToU8(GOOGLE_EARTH_PATH));
    expect(r.zipped).toBe(false);
    expect(parseKml(r.text).lines).toHaveLength(1);
  });

  it('unzips a KMZ and prefers doc.kml', async () => {
    const kmz = zipSync({
      'files/extra.kml': strToU8('<kml></kml>'),
      'doc.kml': strToU8(GOOGLE_EARTH_PATH),
      'files/photo.jpg': new Uint8Array([1, 2, 3]),
    });
    const r = await kmlTextFromBytes(kmz);
    expect(r.zipped).toBe(true);
    expect(parseKml(r.text).lines[0].name).toBe('ORR & Whitefield route');
  });

  it('rejects a KMZ without KML inside', async () => {
    const kmz = zipSync({ 'readme.txt': strToU8('hi') });
    await expect(kmlTextFromBytes(kmz)).rejects.toThrow(/no KML/);
  });
});
