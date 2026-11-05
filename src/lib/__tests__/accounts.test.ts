import { describe, expect, it } from 'vitest';
import { looksDuplicate, queueSort } from '../accounts';
import type { Txn } from '../../types';

function txn(over: Partial<Txn> = {}): Txn {
  return {
    id: 'x',
    projectId: 'p1',
    supervisorName: 'Manoj',
    category: 'diesel',
    amount: 5000,
    gstApplicable: false,
    vendorName: 'HP Fuels',
    description: 'Diesel',
    billPhotoNames: ['p1/bills/2026-11-05/a.jpg'],
    status: 'submitted',
    flaggedDuplicate: false,
    flaggedDieselAnomaly: false,
    submittedAt: new Date().toISOString(),
    ...over,
  } as Txn;
}

describe('looksDuplicate', () => {
  const cand = { projectId: 'p1', vendorName: ' hp fuels ', amount: 5000 };

  it('matches same site + vendor (case/space-insensitive) + amount within 72h', () => {
    expect(looksDuplicate([txn()], cand)).toBe(true);
  });
  it('ignores reversed claims, other sites, other amounts and old claims', () => {
    const old = new Date(Date.now() - 80 * 3600 * 1000).toISOString();
    expect(
      looksDuplicate(
        [
          txn({ status: 'reversed' }),
          txn({ projectId: 'p2' }),
          txn({ amount: 4999 }),
          txn({ submittedAt: old }),
        ],
        cand
      )
    ).toBe(false);
  });
});

describe('queueSort', () => {
  it('puts flagged claims first, then oldest first', () => {
    const a = txn({ id: 'a', submittedAt: '2026-11-01T00:00:00Z' });
    const b = txn({ id: 'b', submittedAt: '2026-11-03T00:00:00Z', flaggedDuplicate: true });
    const c = txn({ id: 'c', submittedAt: '2026-10-30T00:00:00Z' });
    expect([a, b, c].sort(queueSort).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });
});
