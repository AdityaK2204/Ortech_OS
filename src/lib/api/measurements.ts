import { requireSupabase } from '../supabase';
import type { Measurement } from '../../types';
import {
  measurementToRow,
  rowToMeasurement,
  type MeasurementRow,
} from './mappers';

/** All measurements visible to the signed-in user (RLS filters by role/site). */
export async function fetchMeasurements(): Promise<Measurement[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('measurements')
    .select('*')
    .order('work_date', { ascending: true })
    .order('chainage_from', { ascending: true });
  if (error) throw error;
  return (data as MeasurementRow[]).map(rowToMeasurement);
}

/** Append a batch of measurements (append-only; enforced by RLS). */
export async function insertMeasurements(ms: Measurement[]): Promise<void> {
  if (ms.length === 0) return;
  const sb = requireSupabase();
  const { error } = await sb.from('measurements').insert(ms.map(measurementToRow));
  if (error) throw error;
}

/** Subscribe to measurement changes; returns an unsubscribe fn. */
export function subscribeMeasurements(onChange: () => void): () => void {
  const sb = requireSupabase();
  const channel = sb
    .channel('measurements-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'measurements' },
      onChange
    )
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
