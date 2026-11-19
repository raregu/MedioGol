import { PlayGroupView } from '../../types/playGroups';

export type PlayCall = (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown; data: unknown }>;

export interface PanelProps {
  view: PlayGroupView;
  call: PlayCall;
  token: string | null;
}

export const CHIP = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap';
export const card = 'rounded-mg-lg border border-mg-line bg-mg-surface p-4 space-y-3';
export const smallBtn = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-mg-md border border-mg-line-strong bg-mg-surface text-mg-ink font-bold text-[13px] disabled:opacity-50';
