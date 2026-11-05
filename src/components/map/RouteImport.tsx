import { useRef, useState } from 'react';
import {
  joinLines,
  lineLength,
  prepareRoute,
  readGoogleEarthFile,
  type Coord,
  type GoogleEarthFile,
} from '../../lib/kml';
import { formatMeters } from '../../lib/progress';

export interface ImportedRoute {
  coords: Coord[];
  source: 'kml' | 'kmz';
  lengthM: number;
  label: string;
}

interface Choice {
  key: string;
  label: string;
  detail: string;
  coords: Coord[];
}

function choicesFor(file: GoogleEarthFile): Choice[] {
  const { lines, points } = file.contents;
  const out: Choice[] = lines.map((l, i) => ({
    key: `line-${i}`,
    label: l.name,
    detail: `${formatMeters(Math.round(l.lengthM))} · ${l.coords.length} points`,
    coords: l.coords,
  }));
  if (lines.length > 1) {
    const joined = joinLines(lines.map((l) => l.coords));
    out.push({
      key: 'join',
      label: `All ${lines.length} lines joined`,
      detail: `${formatMeters(Math.round(lineLength(joined)))} · joined end to end in file order`,
      coords: joined,
    });
  }
  if (lines.length === 0 && points.length >= 2) {
    const coords = points.map((p) => p.coord);
    out.push({
      key: 'points',
      label: `Connect the ${points.length} pins in order`,
      detail: `${formatMeters(Math.round(lineLength(coords)))} · straight lines between pins`,
      coords,
    });
  }
  return out;
}

/**
 * "Import from Google Earth" — reads a .kml / .kmz the route was marked in,
 * lets the director pick which line is the route, and hands it back.
 */
export default function RouteImport({ onImport }: { onImport: (r: ImportedRoute) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<GoogleEarthFile | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [picked, setPicked] = useState<string>('');

  const apply = (f: GoogleEarthFile, c: Choice) => {
    const coords = prepareRoute(c.coords);
    onImport({
      coords,
      source: f.source,
      lengthM: lineLength(coords),
      label: `${c.label} (${f.fileName})`,
    });
    setFile(null);
    setChoices([]);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null);
    setFile(null);
    setBusy(true);
    try {
      const parsed = await readGoogleEarthFile(f);
      const cs = choicesFor(parsed);
      if (cs.length === 0) {
        const { polygons, points } = parsed.contents;
        setError(
          polygons > 0
            ? 'This file only has shapes (polygons), not a route line. In Google Earth, mark the route with "Add Path" and export again.'
            : points.length === 1
              ? 'This file has a single pin, not a route. In Google Earth, mark the route with "Add Path" and export again.'
              : 'No route line found in this file. In Google Earth, mark the route with "Add Path" and export it as KML or KMZ.'
        );
        return;
      }
      if (cs.length === 1) return apply(parsed, cs[0]);
      // Default to the longest single line — usually the route itself.
      const longest = cs
        .filter((c) => c.key.startsWith('line-'))
        .reduce((a, b) => (lineLength(b.coords) > lineLength(a.coords) ? b : a), cs[0]);
      setFile(parsed);
      setChoices(cs);
      setPicked(longest.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this file.');
    } finally {
      setBusy(false);
    }
  };

  const chosen = choices.find((c) => c.key === picked);

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? 'Reading file…' : '📂 Import from Google Earth (.kml / .kmz)'}
        </button>
        <span className="text-xs text-slate-500">or click on the map to trace it by hand</span>
        <input
          ref={inputRef}
          type="file"
          accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
          className="hidden"
          onChange={onFile}
        />
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">{error}</p>
      )}

      {file && choices.length > 1 && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-800">
            {file.fileName} has more than one line. Which one is the route?
          </div>
          <div className="space-y-1.5">
            {choices.map((c) => (
              <label
                key={c.key}
                className={`flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-sm ring-1 ${
                  picked === c.key ? 'bg-white ring-brand-500' : 'ring-transparent hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="kml-choice"
                  className="mt-0.5"
                  checked={picked === c.key}
                  onChange={() => setPicked(c.key)}
                />
                <span>
                  <span className="font-medium text-slate-800">{c.label}</span>
                  <span className="block text-xs text-slate-500">{c.detail}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!chosen}
              onClick={() => chosen && apply(file, chosen)}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              Use this route
            </button>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setChoices([]);
              }}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
