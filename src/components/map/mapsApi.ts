import { useJsApiLoader } from '@react-google-maps/api';

/** The Google Maps JS API key, supplied via .env (never committed). */
export const MAPS_API_KEY: string =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';

export const hasMapsKey = MAPS_API_KEY.trim().length > 0;

// One shared loader id so every map on the page reuses a single script load.
export function useGoogleMaps() {
  return useJsApiLoader({
    id: 'ortech-google-maps',
    googleMapsApiKey: MAPS_API_KEY,
  });
}
