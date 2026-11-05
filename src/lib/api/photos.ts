import { isSupabaseConfigured, requireSupabase } from '../supabase';

// ---------------------------------------------------------------------------
// Photo evidence (measurements, daily pulses, expense bills).
//
// Backend mode: images are downscaled on the phone, uploaded to the private
// `site-photos` Storage bucket, and the returned object PATHS are what we
// store in the photo_names / bill_photo_names columns. Storage policies
// (migration 0006) only let a site's own supervisor or a director upload,
// and only directors, accountants and that supervisor read.
//
// Local demo mode: there is nowhere to upload, so we keep the file names.
// Rows written before 0006 also hold bare file names; `isStoredPhoto`
// tells the two apart (a stored path always contains a "/").
// ---------------------------------------------------------------------------

export const PHOTO_BUCKET = 'site-photos';
export type PhotoKind = 'measurements' | 'pulses' | 'bills';

/** Longest edge after downscaling — plenty for evidence, small on 4G. */
export const MAX_PHOTO_EDGE = 1600;
const JPEG_QUALITY = 0.8;

export function isStoredPhoto(ref: string): boolean {
  return ref.includes('/');
}

/** `<project>/<kind>/<yyyy-mm-dd>/<id>.<ext>` — the first folder drives RLS. */
export function photoPath(
  projectId: string,
  kind: PhotoKind,
  date: string,
  id: string,
  ext: string
): string {
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  return `${projectId}/${kind}/${day}/${id}.${safeExt}`;
}

/** Scale (w, h) to fit inside `max` on its longest edge, never upscaling. */
export function fitWithin(w: number, h: number, max = MAX_PHOTO_EDGE): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= max || longest === 0) return { w, h };
  const k = max / longest;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

async function downscale(file: File): Promise<{ blob: Blob; ext: string }> {
  const fallbackExt = file.name.includes('.') ? file.name.split('.').pop()! : 'jpg';
  try {
    const bmp = await createImageBitmap(file);
    const { w, h } = fitWithin(bmp.width, bmp.height);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob) throw new Error('encode failed');
    return { blob, ext: 'jpg' };
  } catch {
    // Unsupported format in this browser (e.g. HEIC on desktop) — send as-is.
    return { blob: file, ext: fallbackExt };
  }
}

/**
 * Upload photos and return the references to store on the record.
 * Throws if any upload fails, so the caller never saves a record that
 * claims evidence it doesn't have.
 */
export async function uploadPhotos(
  projectId: string,
  kind: PhotoKind,
  files: File[],
  date: string
): Promise<string[]> {
  if (files.length === 0) return [];
  if (!isSupabaseConfigured) return files.map((f) => f.name);

  const sb = requireSupabase();
  const refs: string[] = [];
  for (const file of files) {
    const { blob, ext } = await downscale(file);
    const path = photoPath(projectId, kind, date, crypto.randomUUID(), ext);
    const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: false,
    });
    if (error) throw new Error(`Photo upload failed (${file.name}): ${error.message}`);
    refs.push(path);
  }
  return refs;
}

/** Short-lived signed URLs for stored photos (legacy names are skipped). */
export async function signedPhotoUrls(
  refs: string[],
  expiresInSec = 60 * 60
): Promise<Record<string, string>> {
  const paths = refs.filter(isStoredPhoto);
  if (paths.length === 0 || !isSupabaseConfigured) return {};
  const sb = requireSupabase();
  const { data, error } = await sb.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, expiresInSec);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const d of data) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
