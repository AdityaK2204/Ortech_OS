import type { LatLng } from '../../types';
import type { RouteOverlay } from '../../lib/routeState';

// ---------------------------------------------------------------------------
// Provider-agnostic map contract. GeographicView / MissionMap build these
// props; a single adapter (currently GoogleRouteMap) renders them. Swapping to
// Mapbox/Leaflet later means writing a new adapter + repointing RouteMap.tsx —
// no changes to the callers.
//
// Extension points (future ops overlays — crew, machines, diesel fills, photos,
// issues, inspections) all become additional `markers` layers, so this contract
// does not need to grow for them.
// ---------------------------------------------------------------------------

export type MarkerKind =
  | 'point_done'
  | 'point_pending'
  | 'work_front'
  | 'start'
  | 'end'
  | 'site'; // mission-map site pin

export interface MapMarker {
  id: string;
  position: LatLng;
  kind: MarkerKind;
  label?: string;
  color?: string; // for 'site' pins (status color)
  onClick?: () => void;
}

export interface RouteMapProps {
  /** the base route path (drawn faint under the overlays) */
  path: LatLng[];
  overlays: RouteOverlay[];
  markers: MapMarker[];
  /** fires with the clicked coordinate; the caller projects it onto chainage */
  onMapClick?: (coord: LatLng) => void;
  showLocateMe?: boolean;
  heightClass?: string; // tailwind height, default h-[460px]
}
