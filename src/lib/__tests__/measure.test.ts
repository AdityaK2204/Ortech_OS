import { describe, expect, it } from 'vitest';
import { actualLength, summarize, taskIdForMeasurement } from '../measure';

describe('actualLength', () => {
  it('is To − From', () => expect(actualLength(120, 185)).toBe(65));
  it('is never negative', () => expect(actualLength(200, 150)).toBe(0));
});

describe('taskIdForMeasurement', () => {
  it('routes measurement types to progress tasks', () => {
    expect(taskIdForMeasurement({ measurementType: 'normal_trenching' })).toBe('t1');
    expect(taskIdForMeasurement({ measurementType: 'restoration' })).toBe('t3');
    expect(taskIdForMeasurement({ measurementType: 'chamber_work' })).toBe('t5');
  });
});

describe('summarize', () => {
  it('totals lengths and photos for the day', () => {
    const s = summarize([
      { actualLengthM: 40, payableLengthM: 40, photoNames: ['a', 'b'] },
      { actualLengthM: 25, payableLengthM: 20, photoNames: [] },
    ]);
    expect(s).toMatchObject({ count: 2, actualLengthM: 65, payableLengthM: 60, photos: 2 });
  });
});
