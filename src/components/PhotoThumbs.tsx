import { useEffect, useState } from 'react';
import { isStoredPhoto, signedPhotoUrls } from '../lib/api/photos';

/**
 * Thumbnails for photo evidence. Stored photos open full-size in a new tab
 * via a short-lived signed URL; legacy / demo entries (file names only) are
 * shown as plain chips.
 */
export default function PhotoThumbs({ refs, size = 64 }: { refs: string[]; size?: number }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = refs.join('|');

  useEffect(() => {
    let alive = true;
    signedPhotoUrls(refs).then((u) => {
      if (alive) setUrls(u);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures refs
  }, [key]);

  if (refs.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {refs.map((ref, i) => {
        const url = urls[ref];
        if (isStoredPhoto(ref) && url) {
          return (
            <a
              key={ref}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
              style={{ width: size, height: size }}
              title="Open full size"
            >
              <img src={url} alt={`Photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
            </a>
          );
        }
        return (
          <span
            key={`${ref}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600"
          >
            📷 {isStoredPhoto(ref) ? `Photo ${i + 1}` : ref}
          </span>
        );
      })}
    </div>
  );
}
