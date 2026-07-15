// Provider boundary. GeographicView imports `RouteMap` from here; swapping to
// Mapbox/Leaflet later means pointing this single line at a new adapter that
// implements RouteMapProps — no caller changes.
export { default as RouteMap } from './GoogleRouteMap';
