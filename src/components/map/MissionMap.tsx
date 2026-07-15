import { useCallback, useRef } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { useNavigate } from 'react-router-dom';
import type { Project } from '../../types';
import { centroidOf } from '../../lib/geo';
import { overallProgressPct } from '../../lib/progress';
import { useGoogleMaps, hasMapsKey } from './mapsApi';
import MapSetupCard from './MapSetupCard';

const STATUS_MARKER: Record<string, string> = {
  on_track: '#16a34a',
  at_risk: '#f59e0b',
  behind: '#dc2626',
  on_hold: '#94a3b8',
};

function sitePin(color: string) {
  return (
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
        <path d="M15 39 C5 26 1 20 1 13 A14 14 0 0 1 29 13 C29 20 25 26 15 39 Z" fill="${color}" stroke="#fff" stroke-width="2"/>
        <circle cx="15" cy="13" r="5" fill="#fff"/>
      </svg>`
    )
  );
}

/** India-wide overview: one status-colored pin per site, click → drill in. */
export default function MissionMap({ projects }: { projects: Project[] }) {
  if (!hasMapsKey) return <MapSetupCard heightClass="h-[560px]" />;
  return <MissionCanvas projects={projects} />;
}

function MissionCanvas({ projects }: { projects: Project[] }) {
  const { isLoaded, loadError } = useGoogleMaps();
  const navigate = useNavigate();
  const mapRef = useRef<google.maps.Map | null>(null);

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      if (projects.length === 0) return;
      const bounds = new google.maps.LatLngBounds();
      projects.forEach((p) => bounds.extend(centroidOf(p.route)));
      map.fitBounds(bounds, 64);
    },
    [projects]
  );

  if (loadError)
    return (
      <div className="flex h-[560px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-600">
        Failed to load Google Maps — check the API key and that the Maps JavaScript API is enabled.
      </div>
    );
  if (!isLoaded)
    return (
      <div className="flex h-[560px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-400">
        Loading map…
      </div>
    );

  return (
    <div className="h-[560px] w-full overflow-hidden rounded-2xl border border-slate-200">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={{ lat: 22.5, lng: 79 }}
        zoom={5}
        onLoad={onLoad}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        }}
      >
        {projects.map((p) => {
          const color = STATUS_MARKER[p.status] ?? '#0d9488';
          return (
            <Marker
              key={p.id}
              position={centroidOf(p.route)}
              title={`${p.name} — ${overallProgressPct(p)}% (${p.status.replace('_', ' ')})`}
              onClick={() => navigate(`/project/${p.id}`)}
              icon={{
                url: sitePin(color),
                scaledSize: new google.maps.Size(30, 40),
                anchor: new google.maps.Point(15, 39),
              }}
            />
          );
        })}
      </GoogleMap>
    </div>
  );
}
