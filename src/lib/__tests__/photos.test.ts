import { describe, expect, it } from 'vitest';
import { fitWithin, isStoredPhoto, photoPath, uploadPhotos } from '../api/photos';

describe('photoPath', () => {
  it('puts the project id first so storage RLS can read it', () => {
    expect(photoPath('nh-44', 'bills', '2026-11-05', 'abc', 'JPG')).toBe(
      'nh-44/bills/2026-11-05/abc.jpg'
    );
  });

  it('strips unsafe characters from the extension', () => {
    expect(photoPath('p', 'pulses', '2026-11-05', 'id', '../x?')).toBe('p/pulses/2026-11-05/id.x');
    expect(photoPath('p', 'pulses', '2026-11-05', 'id', '')).toBe('p/pulses/2026-11-05/id.jpg');
  });

  it('falls back to today for a malformed date', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(photoPath('p', 'measurements', 'yesterday', 'id', 'png')).toBe(
      `p/measurements/${today}/id.png`
    );
  });
});

describe('fitWithin', () => {
  it('never upscales', () => {
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 });
  });
  it('scales the longest edge down to the limit, keeping aspect ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 });
  });
  it('handles empty images', () => {
    expect(fitWithin(0, 0)).toEqual({ w: 0, h: 0 });
  });
});

describe('isStoredPhoto', () => {
  it('tells storage paths from legacy file names', () => {
    expect(isStoredPhoto('p/bills/2026-11-05/id.jpg')).toBe(true);
    expect(isStoredPhoto('IMG_0042.jpg')).toBe(false);
  });
});

describe('uploadPhotos (demo mode, no Supabase configured)', () => {
  it('keeps file names and uploads nothing', async () => {
    const files = [new File(['x'], 'a.jpg'), new File(['y'], 'b.png')];
    await expect(uploadPhotos('p', 'bills', files, '2026-11-05')).resolves.toEqual([
      'a.jpg',
      'b.png',
    ]);
  });
  it('returns an empty list for no files', async () => {
    await expect(uploadPhotos('p', 'bills', [], '2026-11-05')).resolves.toEqual([]);
  });
});
