/** Shown in place of a map when no Google Maps API key is configured. */
export default function MapSetupCard({ heightClass = 'h-[460px]' }: { heightClass?: string }) {
  return (
    <div
      className={`flex ${heightClass} flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center`}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-2xl shadow-sm">
        🗺️
      </div>
      <h3 className="text-base font-bold text-slate-800">Add your Google Maps key to see the map</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        The geographic view is ready — it just needs a Google Maps JavaScript API key.
      </p>
      <ol className="mt-4 max-w-md space-y-1 text-left text-sm text-slate-600">
        <li>
          1. Create a key in{' '}
          <span className="font-semibold">Google Cloud Console → Credentials</span> (enable the{' '}
          <span className="font-semibold">Maps JavaScript API</span>).
        </li>
        <li>
          2. Copy <code className="rounded bg-slate-200 px-1">.env.example</code> to{' '}
          <code className="rounded bg-slate-200 px-1">.env</code> and paste the key into{' '}
          <code className="rounded bg-slate-200 px-1">VITE_GOOGLE_MAPS_API_KEY</code>.
        </li>
        <li>
          3. Restart the dev server (<code className="rounded bg-slate-200 px-1">npm run dev</code>).
        </li>
      </ol>
      <p className="mt-4 text-xs text-slate-400">
        Everything else in the app works without a key.
      </p>
    </div>
  );
}
