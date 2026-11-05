import { describe, expect, it } from 'vitest';
import { clamp, mergeSegments } from '../progress';

describe('mergeSegments', () => {
  it('merges overlapping and touching spans, sorted', () => {
    expect(
      mergeSegments([
        { start: 300, end: 400 },
        { start: 0, end: 100 },
        { start: 100, end: 150 },
        { start: 120, end: 200 },
      ])
    ).toEqual([
      { start: 0, end: 200 },
      { start: 300, end: 400 },
    ]);
  });
  it('drops empty or inverted spans', () => {
    expect(mergeSegments([{ start: 50, end: 50 }, { start: 80, end: 10 }])).toEqual([]);
  });
  it('does not mutate its input', () => {
    const input = [{ start: 0, end: 10 }, { start: 5, end: 20 }];
    mergeSegments(input);
    expect(input).toEqual([{ start: 0, end: 10 }, { start: 5, end: 20 }]);
  });
});

describe('clamp', () => {
  it('bounds to 0–100 by default', () => {
    expect(clamp(-5)).toBe(0);
    expect(clamp(150)).toBe(100);
    expect(clamp(42)).toBe(42);
  });
});
