import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// ---------------------------------------------------------------------------
// PWA lifecycle UI: an "install app" banner (Android/desktop Chrome) and an
// "update available" toast when a new build is deployed. Field users install
// once, then the app opens full-screen from the home screen like a native app.
// ---------------------------------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'ortech.pwa.install.dismissed';

export default function PwaManager() {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === '1'
  );

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    setInstallEvt(null);
  };

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <>
      {/* Update toast — deploys reach phones without an app store */}
      {needRefresh && (
        <div className="fixed inset-x-3 bottom-20 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-xl sm:bottom-4">
          <span className="flex-1 text-sm font-medium">
            A new version of ORTECH OS is ready.
          </span>
          <button
            onClick={() => updateServiceWorker(true)}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold transition hover:bg-brand-400"
          >
            Update
          </button>
        </div>
      )}

      {/* Install banner */}
      {installEvt && !dismissed && !needRefresh && (
        <div className="fixed inset-x-3 bottom-20 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl sm:bottom-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-700">
            <svg viewBox="0 0 32 32" className="h-6 w-6">
              <path d="M6 20h6v3H6zM14 14h8v3h-8zM10 8h14v3H10z" fill="#5eead4" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900">Install ORTECH OS</div>
            <div className="text-xs text-slate-500">
              Works offline on site · opens like an app
            </div>
          </div>
          <button
            onClick={dismiss}
            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-700"
          >
            Later
          </button>
          <button
            onClick={install}
            className="rounded-lg bg-brand-700 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-brand-800"
          >
            Install
          </button>
        </div>
      )}
    </>
  );
}
