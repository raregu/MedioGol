import { useEffect, useState } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MatchSheetPrint } from '../components/MatchSheetPrint';
import { MatchSheetContext } from '../utils/matchSheet';

const MAX_SHEETS = 120;

/** Ids de partidos según la URL: ?match=, ?championship=&round= o ?league=&round= */
const resolveMatchIds = async (params: URLSearchParams, signal: AbortSignal): Promise<string[]> => {
  const match = params.get('match');
  if (match) return [match];
  const round = Number(params.get('round'));
  const championship = params.get('championship');
  const league = params.get('league');
  let championshipIds: string[] = [];
  if (championship) championshipIds = [championship];
  else if (league) {
    const { data, error } = await supabase
      .from('championships')
      .select('id')
      .eq('league_id', league)
      .order('display_order')
      .abortSignal(signal);
    if (error) throw error;
    championshipIds = (data || []).map((c) => c.id);
  }
  if (!championshipIds.length || !Number.isFinite(round)) return [];
  const { data, error } = await supabase
    .from('matches')
    .select('id, championship_id, match_date')
    .in('championship_id', championshipIds)
    .eq('round', round)
    .neq('status', 'cancelled')
    .order('match_date')
    .limit(MAX_SHEETS)
    .abortSignal(signal);
  if (error) throw error;
  const order = new Map(championshipIds.map((id, i) => [id, i]));
  return (data || [])
    .sort((a, b) => (order.get(a.championship_id)! - order.get(b.championship_id)!) || a.match_date.localeCompare(b.match_date))
    .map((m) => m.id);
};

/**
 * Papeletas imprimibles (A4). Imprimir → "Guardar como PDF" para descargarlas.
 * Solo quien administra el partido recibe datos (match_sheet_contexts verifica permisos).
 */
export const MatchSheets = () => {
  const { profile, loading: authLoading } = useAuth();
  const [sheets, setSheets] = useState<MatchSheetContext[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      setStatus('error');
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const ids = await resolveMatchIds(new URLSearchParams(window.location.search), controller.signal);
        if (!ids.length) {
          setStatus('empty');
          return;
        }
        const { data, error } = await supabase.rpc('match_sheet_contexts', { p_match_ids: ids }).abortSignal(controller.signal);
        if (error) throw error;
        const list = (data || []) as MatchSheetContext[];
        setSheets(list);
        setStatus(list.length ? 'ready' : 'empty');
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Error cargando papeletas:', err);
        setStatus('error');
      }
    })();
    return () => controller.abort();
  }, [profile?.id, authLoading]);

  return (
    <div className="min-h-screen bg-mg-bg print:bg-white">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print { .sheet-page { break-after: page; } .sheet-page:last-child { break-after: auto; } }
      `}</style>

      <div className="print:hidden sticky top-0 z-10 bg-mg-navy text-mg-on-navy">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-mg-md font-bold text-sm hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
          </button>
          <div className="flex-1 min-w-[12rem]">
            <p className="font-extrabold">Papeletas de partido</p>
            <p className="text-sm text-mg-on-navy-muted">
              {status === 'ready' ? `${sheets.length} ${sheets.length === 1 ? 'papeleta' : 'papeletas'} · tamaño A4` : 'Preparando…'}
            </p>
          </div>
          <button
            onClick={() => window.print()}
            disabled={status !== 'ready'}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-mg-md bg-mg-gold text-mg-on-gold font-extrabold text-sm disabled:opacity-50"
          >
            <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir o guardar PDF
          </button>
        </div>
        <p className="max-w-5xl mx-auto px-4 pb-3 text-xs text-mg-on-navy-muted">
          Para descargar: “Imprimir o guardar PDF” → destino “Guardar como PDF”. Las papeletas tienen el QR de cada partido para subir la foto después.
        </p>
      </div>

      {status === 'loading' && <p className="p-10 text-center text-mg-muted" role="status">Cargando papeletas…</p>}
      {status === 'empty' && <p className="p-10 text-center text-mg-muted">No hay partidos para imprimir en esa fecha, o no tienes permiso para administrarlos.</p>}
      {status === 'error' && (
        <p className="p-10 text-center text-mg-danger" role="alert">
          {profile ? 'No pudimos cargar las papeletas. Intenta de nuevo.' : 'Debes iniciar sesión como administrador para descargar papeletas.'}
        </p>
      )}

      {status === 'ready' && (
        <div className="flex flex-col items-center gap-6 py-6 print:block print:p-0">
          {sheets.map((s) => (
            <div key={s.match_id} className="sheet-page shadow-mg-card print:shadow-none">
              <MatchSheetPrint ctx={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
