import { useCallback, useRef } from 'react';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import { useGoogleMaps, hasMapsKey } from './mapsApi';
import MapSetupCard from './MapSetupCard';

/** GeoJSON [lng,lat] pairs the admin has drawn for the route. */
type Coords = [number, number][];

export default function RouteDrawMap({
  value,
  onChange,
  heightClass = 'h-[360px]',
}: {
  value: Coords;
  onChange: (coords: Coords) => void;
  heightClass?: string;
}) {
  if (!hasMapsKey) return <MapSetupCard heightClass={heightClass} />;
  return <DrawCanvas value={value} onChange={onChange} heightClass={heightClass} />;
}

function DrawCanvas({
  value,
  onChange,
  heightClass,
}: {
  value: Coords;
  onChange: (coords: Coords) => void;
  heightClass: string;
}) {
  const { isLoaded, loadError } = useGoogleMaps();
  const mapRef = useRef<google.maps.Map | null>(null);

  const path = value.map(([lng, lat]) => ({ lat, lng }));

  const addPoint = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      onChange([...value, [e.latLng.lng(), e.latLng.lat()]]);
    },
    [value, onChange]
  );

  if (loadError)
    return (
      <div className={`flex ${heightClass} items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-600`}>
        Failed to load Google Maps — check the API key.
      </div>
    );
  if (!isLoaded)
    return (
      <div className={`flex ${heightClass} items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-400`}>
        Loading map…
      </div>
    );

  return (
    <div className={`relative w-full overflow-hidden rounded-xl ${heightClass}`}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={path[path.length - 1] ?? { lat: 20.6, lng: 78.9 }}
        zoom={path.length ? 15 : 5}
        onLoad={(m) => {
          mapRef.current = m;
        }}
        onClick={addPoint}
        options={{
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: false,
          clickableIcons: false,
        }}
      >
        {path.length >= 2 && (
          <Polyline
            path={path}
            options={{ strokeColor: '#0d9488', strokeWeight: 5, strokeOpacity: 1 }}
          />
        )}
        {path.map((p, i) => (
          <Marker
            key={i}
            position={p}
            label={{ text: String(i + 1), color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: i === 0 ? '#0f766e' : i === path.length - 1 ? '#e11d48' : '#0d9488',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 2,
            }}
          />
        ))}
      </GoogleMap>

      {/* controls */}
      <div className="absolute left-3 top-3 z-10 flex gap-2">
        <span className="rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow ring-1 ring-slate-200">
          {path.length} point{path.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => onChange(value.slice(0, -1))}
          disabled={value.length === 0}
          className="rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow ring-1 ring-slate-200 transition hover:bg-white disabled:opacity-40"
        >
          ↶ Undo
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={value.length === 0}
          className="rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-rose-600 shadow ring-1 ring-slate-200 transition hover:bg-white disabled:opacity-40"
        >
          Clear
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900/80 px-3 py-1.5 text-[11px] font-medium text-white">
        Click along the road to trace the route
      </div>
    </div>
  );
}
