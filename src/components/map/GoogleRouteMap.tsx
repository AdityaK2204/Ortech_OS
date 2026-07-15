import { useCallback, useMemo, useRef, useState } from 'react';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import type { LatLng } from '../../types';
import type { MapMarker, RouteMapProps } from './types';
import { boundsOf } from '../../lib/geo';

// SVG marker icons (data URIs) — keeps the adapter self-contained.
function pin(fill: string, stroke = '#ffffff') {
  return (
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
        <circle cx="13" cy="13" r="8" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
      </svg>`
    )
  );
}

function emojiPin(emoji: string) {
  return (
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
        <circle cx="17" cy="17" r="13" fill="#ffffff" stroke="#2563eb" stroke-width="2.5"/>
        <text x="17" y="23" font-size="16" text-anchor="middle">${emoji}</text>
      </svg>`
    )
  );
}

function iconFor(m: MapMarker) {
  switch (m.kind) {
    case 'point_done':
      return { url: pin('#16a34a'), size: 20 };
    case 'point_pending':
      return { url: pin('#ffffff', '#94a3b8'), size: 18 };
    case 'work_front':
      return { url: emojiPin('👷'), size: 34 };
    case 'start':
      return { url: pin('#0f766e'), size: 22 };
    case 'end':
      return { url: pin('#e11d48'), size: 22 };
    case 'site':
      return { url: pin(m.color ?? '#0d9488'), size: 24 };
  }
}

export default function GoogleRouteMap({
  path,
  overlays,
  markers,
  onMapClick,
  showLocateMe,
  heightClass = 'h-[460px]',
}: RouteMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const [myLoc, setMyLoc] = useState<LatLng | null>(null);

  const center = useMemo<LatLng>(
    () => path[Math.floor(path.length / 2)] ?? { lat: 20.5, lng: 78.9 },
    [path]
  );

  const fit = useCallback(
    (map: google.maps.Map) => {
      if (path.length < 2) return;
      const b = boundsOf(path);
      map.fitBounds(
        { north: b.north, south: b.south, east: b.east, west: b.west },
        48
      );
    },
    [path]
  );

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      fit(map);
    },
    [fit]
  );

  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMyLoc(loc);
      mapRef.current?.panTo(loc);
    });
  };

  return (
    <div className={`relative w-full overflow-hidden rounded-xl ${heightClass}`}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={center}
        zoom={14}
        onLoad={onLoad}
        onClick={(e) =>
          e.latLng && onMapClick?.({ lat: e.latLng.lat(), lng: e.latLng.lng() })
        }
        options={{
          streetViewControl: false,
          mapTypeControl: true,
          mapTypeId: 'roadmap',
          fullscreenControl: false,
          clickableIcons: false,
        }}
      >
        {/* faint base route */}
        <Polyline
          path={path}
          options={{ strokeColor: '#cbd5e1', strokeOpacity: 0.9, strokeWeight: 8, zIndex: 1 }}
        />

        {/* colored state overlays */}
        {overlays.map((o, i) =>
          o.path.length >= 2 ? (
            <Polyline
              key={i}
              path={o.path}
              options={
                o.dashed
                  ? {
                      strokeOpacity: 0,
                      zIndex: 6,
                      icons: [
                        {
                          icon: {
                            path: 'M 0,-1 0,1',
                            strokeColor: o.color,
                            strokeOpacity: 1,
                            strokeWeight: 3,
                            scale: 3,
                          },
                          offset: '0',
                          repeat: '12px',
                        },
                      ],
                    }
                  : {
                      strokeColor: o.color,
                      strokeOpacity: 1,
                      strokeWeight: 6,
                      zIndex: o.state === 'worked_today' ? 5 : 3,
                    }
              }
              onClick={(e) =>
                e.latLng && onMapClick?.({ lat: e.latLng.lat(), lng: e.latLng.lng() })
              }
            />
          ) : null
        )}

        {/* markers */}
        {markers.map((m) => {
          const icon = iconFor(m);
          return (
            <Marker
              key={m.id}
              position={m.position}
              title={m.label}
              onClick={m.onClick}
              icon={{
                url: icon.url,
                scaledSize: new google.maps.Size(icon.size, icon.size),
                anchor: new google.maps.Point(icon.size / 2, icon.size / 2),
              }}
            />
          );
        })}

        {myLoc && (
          <Marker
            position={myLoc}
            icon={{
              url: pin('#2563eb'),
              scaledSize: new google.maps.Size(18, 18),
              anchor: new google.maps.Point(9, 9),
            }}
            title="You are here"
          />
        )}
      </GoogleMap>

      {showLocateMe && (
        <button
          type="button"
          onClick={locateMe}
          className="absolute bottom-4 right-3 z-10 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:bg-slate-50"
        >
          📍 Locate me
        </button>
      )}
    </div>
  );
}
