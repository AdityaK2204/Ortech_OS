import { requireSupabase } from '../supabase';
import type { DailyPulse } from '../../types';
import { pulseToRow, rowToPulse, type PulseRow } from './mappers';

/** All pulses visible to the signed-in user (RLS filters by role/site). */
export async function fetchPulses(): Promise<DailyPulse[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('pulses')
    .select('*')
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  return (data as PulseRow[]).map(rowToPulse);
}

/** Append a daily pulse (append-only; enforced by RLS + no update policy). */
export async function insertPulse(pulse: DailyPulse): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('pulses').insert(pulseToRow(pulse));
  if (error) throw error;
}

/** Subscribe to new pulses; returns an unsubscribe fn. */
export function subscribePulses(onChange: () => void): () => void {
  const sb = requireSupabase();
  const channel = sb
    .channel('pulses-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pulses' }, onChange)
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
