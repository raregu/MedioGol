import { useState } from 'react';
import { AlertTriangle, Check, FileSpreadsheet, Loader2, RefreshCw, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MAX_ROWS, ParsedRoster, RosterRow, cleanRut, formatRut, maskRut, parseRosterFile, rutIsValid } from '../utils/rosterImport';

interface Props {
  teamId: string;
  teamName: string;
  onClose: () => void;
  onDone?: () => void;
}

interface Check {
  i: number;
  valid: boolean;
  exists: boolean;
  in_team: boolean;
  other_team: string | null;
}

type Step = 'pick' | 'review' | 'done';

const btn = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-mg-md font-extrabold text-sm disabled:opacity-50';
const primary = `${btn} bg-mg-pitch text-mg-on-pitch`;
const secondary = `${btn} border border-mg-line-strong bg-mg-surface text-mg-ink`;

const errText = (e: unknown, fallback: string) => {
  const x = e as { code?: string; message?: string } | null;
  if (x?.code === '42501') return 'No tienes permiso para cargar la nómina de este equipo.';
  if (x?.code === '22023') return x.message || fallback;
  if (x?.code === 'PGRST202' || x?.code === '42883') return 'La carga de nóminas aún no está activada en la base de datos.';
  return fallback;
};

/**
 * Cargar la nómina de un equipo desde Excel: se lee en el navegador, se revisa cada fila contra la base
 * (RUT válido, ya existe, ya está en el equipo, inscrito en otro equipo del campeonato) y se carga de una vez.
 */
export const RosterImportModal = ({ teamId, teamName, onClose, onDone }: Props) => {
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<string>('');
  const [parsed, setParsed] = useState<ParsedRoster | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [checks, setChecks] = useState<Record<number, Check>>({});
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; created: number; already: number; skipped: number } | null>(null);

  const runCheck = async (list: RosterRow[]) => {
    const { data, error: err } = await supabase.rpc('roster_import_check', {
      p_team: teamId,
      p_rows: list.map((r) => ({ i: r.i, rut: r.rutValid ? r.rut : '' })),
    });
    if (err) throw err;
    const map: Record<number, Check> = {};
    for (const c of (data || []) as Check[]) map[c.i] = c;
    setChecks(map);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const p = await parseRosterFile(f);
      if (p.rows.length === 0) throw new Error('La planilla no tiene jugadores.');
      setFile(f.name);
      setParsed(p);
      setRows(p.rows);
      // Por defecto no se cargan los repetidos dentro de la misma planilla
      const seen = new Set<string>();
      const dup = new Set<number>();
      p.rows.forEach((r) => {
        const k = cleanRut(r.rut);
        if (k && seen.has(k)) dup.add(r.i);
        if (k) seen.add(k);
      });
      setSkip(dup);
      await runCheck(p.rows);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error && !(e as { code?: string }).code ? e.message : errText(e, 'No pudimos leer la planilla.'));
    } finally {
      setBusy(false);
    }
  };

  const editRut = (i: number, value: string) => {
    setRows((list) => list.map((r) => (r.i === i ? { ...r, rut: value, rutValid: rutIsValid(value) } : r)));
  };
  const recheck = async () => {
    setBusy(true);
    setError(null);
    try {
      setRows((list) => list.map((r) => ({ ...r, rut: r.rutValid ? formatRut(r.rut) : r.rut })));
      await runCheck(rows);
    } catch (e) {
      setError(errText(e, 'No pudimos revisar la planilla.'));
    } finally {
      setBusy(false);
    }
  };

  const toLoad = rows.filter((r) => !skip.has(r.i) && !checks[r.i]?.in_team && (r.rutValid || !r.rut));
  const doImport = async () => {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('roster_import', {
      p_team: teamId,
      p_rows: toLoad.map((r) => ({ name: r.name, rut: r.rutValid ? r.rut : '', birth: r.birth })),
    });
    setBusy(false);
    if (err) return setError(errText(err, 'No pudimos cargar la nómina.'));
    setResult(data as typeof result);
    setStep('done');
    onDone?.();
  };

  const status = (r: RosterRow): { tone: string; text: string; icon: 'ok' | 'warn' | 'info' } => {
    const c = checks[r.i];
    if (skip.has(r.i)) return { tone: 'text-mg-muted', text: 'No se carga', icon: 'info' };
    if (r.rut && !r.rutValid) return { tone: 'text-mg-gold-ink', text: 'RUT inválido', icon: 'warn' };
    if (!r.rut) return { tone: 'text-mg-gold-ink', text: 'Sin RUT', icon: 'warn' };
    if (c?.in_team) return { tone: 'text-mg-muted', text: 'Ya está en el equipo', icon: 'info' };
    if (c?.other_team) return { tone: 'text-mg-gold-ink', text: `También en ${c.other_team}`, icon: 'warn' };
    if (c?.exists) return { tone: 'text-[#0c447c]', text: 'Ya existe en MedioGol', icon: 'info' };
    return { tone: 'text-mg-pitch-deep', text: 'Nuevo', icon: 'ok' };
  };
  const counts = rows.reduce(
    (a, r) => {
      const s = status(r);
      if (s.text === 'Nuevo') a.new++;
      else if (s.icon === 'warn') a.warn++;
      else if (s.text === 'Ya existe en MedioGol') a.exists++;
      return a;
    },
    { new: 0, warn: 0, exists: 0 }
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50 font-sans text-mg-ink" role="dialog" aria-modal="true" aria-labelledby="roster-title">
      <div className="bg-mg-surface w-full sm:max-w-3xl max-h-[95vh] rounded-t-mg-lg sm:rounded-mg-lg overflow-hidden flex flex-col">
        <header className="flex items-center gap-3 px-4 py-3 bg-emerald-950 text-white">
          <FileSpreadsheet className="h-5 w-5 text-amber-400" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h2 id="roster-title" className="font-black leading-tight">Cargar nómina</h2>
            <p className="text-xs text-emerald-200 truncate">{teamName}</p>
          </div>
          <button type="button" onClick={onClose} className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-white/10" aria-label="Cerrar">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="p-4 overflow-y-auto space-y-4">
          {step === 'pick' && (
            <>
              <label className="block border-2 border-dashed border-mg-line-strong rounded-mg-lg p-8 text-center cursor-pointer hover:border-mg-pitch">
                {busy ? <Loader2 className="h-8 w-8 mx-auto animate-spin text-mg-pitch" aria-hidden="true" /> : <FileSpreadsheet className="h-8 w-8 mx-auto text-mg-pitch" aria-hidden="true" />}
                <span className="block mt-2 font-extrabold">{busy ? 'Leyendo la planilla…' : 'Elige el Excel de la nómina'}</span>
                <span className="block text-sm text-mg-muted mt-1">.xlsx, .xls o .csv · hasta {MAX_ROWS} jugadores</span>
                <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <p className="text-sm text-mg-muted">
                Sirve el formato de las asociaciones (N°, A. Paterno, A. Materno, Nombre, RUT, F. de nac.) aunque la tabla empiece más abajo. El archivo se lee en tu
                teléfono o computador: no se guarda. El RUT y la fecha de nacimiento quedan privados (solo los ve la organización).
              </p>
            </>
          )}

          {step === 'review' && parsed && (
            <>
              <div className="text-sm">
                <p className="font-bold truncate">{file}</p>
                {(parsed.club || parsed.serie) && (
                  <p className="text-mg-muted">
                    En la planilla: {[parsed.club, parsed.serie].filter(Boolean).join(' · ')}. Se carga en <span className="font-bold text-mg-ink">{teamName}</span>.
                  </p>
                )}
                {parsed.missing.length > 0 && <p className="text-mg-gold-ink font-bold">No encontramos la columna: {parsed.missing.join(', ')}.</p>}
              </div>
              <div className="flex flex-wrap gap-2 text-sm font-bold">
                <span className="px-3 py-1 rounded-full bg-mg-pitch-tint text-mg-pitch-deep">{counts.new} nuevos</span>
                <span className="px-3 py-1 rounded-full bg-[#e3eefc] text-[#0c447c]">{counts.exists} ya existen</span>
                {counts.warn > 0 && <span className="px-3 py-1 rounded-full bg-[#fff4d6] text-mg-gold-ink">{counts.warn} por revisar</span>}
              </div>
              <ul className="divide-y divide-mg-line border border-mg-line rounded-mg-md">
                {rows.map((r) => {
                  const s = status(r);
                  const off = skip.has(r.i);
                  return (
                    <li key={r.i} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${s.icon === 'warn' && !off ? 'bg-[#fff8e6]' : ''}`}>
                      <input
                        type="checkbox"
                        className="h-5 w-5 flex-none"
                        checked={!off}
                        aria-label={`Cargar a ${r.name}`}
                        onChange={(e) => setSkip((prev) => { const n = new Set(prev); if (e.target.checked) n.delete(r.i); else n.add(r.i); return n; })}
                      />
                      <span className={`flex-1 min-w-[10rem] ${off ? 'line-through text-mg-muted' : 'font-semibold'}`}>{r.name}</span>
                      {r.rut && !r.rutValid ? (
                        <input
                          aria-label={`RUT de ${r.name}`}
                          value={r.rut}
                          onChange={(e) => editRut(r.i, e.target.value)}
                          className="w-32 min-h-[36px] px-2 border border-mg-gold rounded-mg-sm text-sm mg-num"
                        />
                      ) : (
                        <span className="w-32 text-sm text-mg-muted mg-num">{r.rut ? maskRut(r.rut) : '—'}</span>
                      )}
                      <span className="w-14 text-sm text-mg-muted mg-num">{r.birth ? r.birth.slice(0, 4) : '—'}</span>
                      <span className={`w-44 text-xs font-extrabold inline-flex items-center gap-1 ${s.tone}`}>
                        {s.icon === 'ok' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : s.icon === 'warn' ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                        {s.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-mg-muted">
                Los "Sin RUT" se cargan igual, pero no se pueden validar en cancha ni reclamar después. "También en…" se carga y queda para que lo revises.
              </p>
            </>
          )}

          {step === 'done' && result && (
            <div role="status" className="rounded-mg-lg bg-mg-pitch-tint border border-[#bfe3cb] p-4 space-y-1">
              <p className="font-extrabold text-mg-pitch-deep text-lg">Nómina cargada</p>
              <p className="text-sm">
                {result.added} {result.added === 1 ? 'jugador inscrito' : 'jugadores inscritos'} en {teamName}
                {result.created ? ` (${result.created} fichas nuevas)` : ''}
                {result.already ? ` · ${result.already} ya estaban` : ''}
                {result.skipped ? ` · ${result.skipped} no se cargaron por datos inválidos` : ''}.
              </p>
            </div>
          )}

          {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 px-4 py-3 border-t border-mg-line">
          {step === 'review' && (
            <>
              <button type="button" className={secondary} disabled={busy} onClick={recheck}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Revisar de nuevo
              </button>
              <button type="button" className={primary} disabled={busy || toLoad.length === 0} onClick={doImport}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Cargar {toLoad.length} {toLoad.length === 1 ? 'jugador' : 'jugadores'}
              </button>
            </>
          )}
          {step !== 'review' && (
            <button type="button" className={step === 'done' ? primary : secondary} onClick={onClose}>
              {step === 'done' ? 'Listo' : 'Cancelar'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
