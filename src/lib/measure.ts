import type {
  Measurement,
  MeasurementInput,
  MeasurementType,
  PayableItem,
  Strata,
} from '../types';

// ---------------------------------------------------------------------------
// Digital Measurement Book — domain constants & pure helpers.
// The supervisor records a stretch ONCE; these helpers derive everything the
// JMS/billing/progress layers need. No manual calculations anywhere.
// ---------------------------------------------------------------------------

export const STRATA_META: { value: Strata; label: string; short: string }[] = [
  { value: 'non_rocky', label: 'Non Rocky', short: 'NR' },
  { value: 'dry_rocky', label: 'Dry Rocky', short: 'DR' },
  { value: 'hard_rock', label: 'Hard Rock', short: 'HR' },
  { value: 'hdd', label: 'HDD', short: 'HDD' },
];

export function strataLabel(s: Strata): string {
  return STRATA_META.find((m) => m.value === s)?.label ?? s;
}

export const MEASUREMENT_TYPES: { value: MeasurementType; label: string }[] = [
  { value: 'normal_trenching', label: 'Normal Trenching' },
  { value: 'hdd_crossing', label: 'HDD Crossing' },
  { value: 'culvert', label: 'Culvert' },
  { value: 'road_crossing', label: 'Road Crossing' },
  { value: 'bridge_crossing', label: 'Bridge Crossing' },
  { value: 'chamber_work', label: 'Chamber Work' },
  { value: 'restoration', label: 'Restoration' },
  { value: 'other', label: 'Other' },
];

export function measurementTypeLabel(t: MeasurementType): string {
  return MEASUREMENT_TYPES.find((m) => m.value === t)?.label ?? t;
}

/** JMS "Other Payable Items" columns, in sheet order. */
export const PAYABLE_ITEMS: { value: PayableItem; label: string }[] = [
  { value: 'plb', label: 'PLB' },
  { value: 'blowing', label: 'Blowing' },
  { value: 'cc', label: 'C.C.' },
  { value: 'dwc', label: 'DWC' },
  { value: 'gi', label: 'GI' },
  { value: 'chamber', label: 'Chamber' },
  { value: 'route_marker', label: 'RM' },
  { value: 'fdms_df', label: 'FDMS/DF' },
  { value: 'others', label: 'Others' },
];

/** JMS "Restoration" columns, in sheet order. */
export const RESTORATION_ITEMS: { value: PayableItem; label: string }[] = [
  { value: 'gravel', label: 'Gravel' },
  { value: 'wbm', label: 'WBM' },
  { value: 'asphalt', label: 'Asphalt' },
];

export function payableItemLabel(v: PayableItem): string {
  return (
    [...PAYABLE_ITEMS, ...RESTORATION_ITEMS].find((m) => m.value === v)?.label ?? v
  );
}

/** Actual length is always derived: To − From. Never typed, never wrong. */
export function actualLength(fromM: number, toM: number): number {
  return Math.max(0, toM - fromM);
}

/**
 * Which linear task a measurement's length feeds when replayed into progress.
 * Trenching-family strata (incl. HDD) advance Trenching (t1); chamber work is
 * a point task handled by count, restoration advances Refilling (t3).
 */
export function taskIdForMeasurement(m: {
  measurementType: MeasurementType;
}): string | null {
  switch (m.measurementType) {
    case 'restoration':
      return 't3';
    case 'chamber_work':
      return 't5';
    default:
      return 't1'; // trenching family (normal / HDD / crossings)
  }
}

/** Per-day summary the supervisor sees before Submit Day. */
export interface DaySummary {
  count: number;
  actualLengthM: number;
  payableLengthM: number;
  photos: number;
}

export function summarize(measurements: Pick<Measurement, 'actualLengthM' | 'payableLengthM' | 'photoNames'>[]): DaySummary {
  return {
    count: measurements.length,
    actualLengthM: measurements.reduce((s, m) => s + m.actualLengthM, 0),
    payableLengthM: measurements.reduce((s, m) => s + m.payableLengthM, 0),
    photos: measurements.reduce((s, m) => s + m.photoNames.length, 0),
  };
}

/**
 * JMS row projection — exactly how one measurement lands on the sheet.
 * Strata columns carry the payable length in the ONE matching column; each
 * ticked payable item repeats the payable length in its column (per the
 * existing Joint Measurement Sheet convention).
 */
export interface JmsRow {
  sNo: number;
  landmark: string;
  from: number;
  to: number;
  depthCm: number | '';
  actualM: number;
  payableM: number;
  strata: Record<Strata, number | ''>;
  items: Record<PayableItem, number | ''>;
  remarks: string;
}

export function toJmsRow(m: Measurement, sNo: number): JmsRow {
  const strata = { non_rocky: '', dry_rocky: '', hard_rock: '', hdd: '' } as Record<
    Strata,
    number | ''
  >;
  strata[m.strata] = m.payableLengthM;

  const items = Object.fromEntries(
    [...PAYABLE_ITEMS, ...RESTORATION_ITEMS].map((i) => [i.value, ''])
  ) as Record<PayableItem, number | ''>;
  for (const item of m.payableItems) items[item] = m.payableLengthM;

  const typePrefix =
    m.measurementType !== 'normal_trenching'
      ? `${measurementTypeLabel(m.measurementType)}, `
      : '';

  return {
    sNo,
    landmark: `${typePrefix}${m.landmark ?? ''}`.replace(/, $/, '').trim() || '—',
    from: m.chainageFrom,
    to: m.chainageTo,
    depthCm: m.depthCm ?? '',
    actualM: m.actualLengthM,
    payableM: m.payableLengthM,
    strata,
    items,
    remarks: m.remarks ?? '',
  };
}

/** Build a full measurement from form input (id/createdAt added by store). */
export function buildMeasurement(input: MeasurementInput): Omit<Measurement, 'id' | 'createdAt'> {
  return { ...input, actualLengthM: actualLength(input.chainageFrom, input.chainageTo) };
}
