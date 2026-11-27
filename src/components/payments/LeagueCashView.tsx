import { FormEvent, useMemo, useState } from 'react';
import { Download, Loader2, Minus, Paperclip, Plus, UserPlus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLeagueCash } from '../../hooks/useLeagueCash';
import { CashCategory, CashKind, CashMovement } from '../../types/leagueCash';
import { downloadCsv, formatCLP, formatDay } from '../../utils/money';
import { CATEGORY_LABEL, IN_CATEGORIES, OUT_CATEGORIES, PERIOD_LABEL, PeriodKey, monthLabel, periodRange } from '../../utils/leagueCash';
import { CashMovementForm } from './CashMovementForm';
import { METHOD_LABEL, Tile, dangerLink, errorText, fieldClass, primaryBtn, secondaryBtn } from './PaymentsUi';

const CHIP = 'inline-flex px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase whitespace-nowrap';

/** Barras de ingresos y egresos por mes (sin librerías: liviano en celular). */
const MonthBars = ({ months }: { months: { month: string; income: number; expense: number }[] }) => {
  const shown = months.slice(-12);
  const max = Math.max(1, ...shown.flatMap((m) => [m.income, m.expense]));
  if (shown.length === 0) return null;
  return (
    <figure className="bg-mg-surface border border-mg-line rounded-mg-lg p-4">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold mb-3">
        Ingresos y egresos por mes
        <span className="inline-flex items-center gap-1.5 text-xs text-mg-muted font-semibold">
          <span className="h-2.5 w-2.5 rounded-sm bg-mg-pitch" aria-hidden="true" /> Ingresos
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-mg-muted font-semibold">
          <span className="h-2.5 w-2.5 rounded-sm bg-mg-danger" aria-hidden="true" /> Egresos
        </span>
      </figcaption>
      <div className="overflow-x-auto">
        <ol className="flex items-end gap-3 h-36 min-w-max">
          {shown.map((m) => (
            <li key={m.month} className="flex flex-col items-center gap-1 w-12">
              <span className="flex items-end gap-1 h-28" aria-label={`${monthLabel(m.month)}: ingresos ${formatCLP(m.income)}, egresos ${formatCLP(m.expense)}`}>
                <span className="w-4 rounded-t-sm bg-mg-pitch" style={{ height: `${Math.max(2, (m.income / max) * 100)}%` }} title={`Ingresos ${formatCLP(m.income)}`} />
                <span className="w-4 rounded-t-sm bg-mg-danger" style={{ height: `${Math.max(2, (m.expense / max) * 100)}%` }} title={`Egresos ${formatCLP(m.expense)}`} />
              </span>
              <span className="text-[11px] font-bold text-mg-muted">{monthLabel(m.month, false)}</span>
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
};

/** Tesoreros de la liga (solo el administrador los ve y los cambia). */
const Treasurers = ({ leagueId, list, onChanged }: { leagueId: string; list: { user_id: string; name: string }[]; onChanged: () => void }) => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc('league_treasurer_add', { p_league: leagueId, p_email: email.trim() });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: errorText(error, 'No se pudo agregar al tesorero.') });
    setEmail('');
    setMsg({ ok: true, text: `${(data as { name: string }).name} ahora puede registrar movimientos.` });
    onChanged();
  };
  const remove = async (userId: string, name: string) => {
    if (!window.confirm(`¿Quitar a ${name} como tesorero de la liga?`)) return;
    const { error } = await supabase.rpc('league_treasurer_remove', { p_league: leagueId, p_user: userId });
    if (error) return setMsg({ ok: false, text: errorText(error, 'No se pudo quitar al tesorero.') });
    onChanged();
  };

  return (
    <section aria-labelledby="treasurers-title" className="bg-mg-surface border border-mg-line rounded-mg-lg p-4 space-y-3">
      <div>
        <h3 id="treasurers-title" className="font-extrabold">Tesoreros</h3>
        <p className="text-sm text-mg-muted">Pueden ver la caja, registrar ingresos y egresos y anularlos. No pueden nombrar a otros tesoreros.</p>
      </div>
      {list.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {list.map((t) => (
            <li key={t.user_id} className="inline-flex items-center gap-1 rounded-full border border-mg-line bg-mg-surface-2 pl-3 pr-1 py-1 text-sm font-bold">
              {t.name}
              <button type="button" onClick={() => remove(t.user_id, t.name)} className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-mg-danger-tint text-mg-muted hover:text-mg-danger" aria-label={`Quitar a ${t.name}`}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <label htmlFor="treasurer-email" className="sr-only">Correo del tesorero</label>
        <input id="treasurer-email" type="email" required placeholder="correo@ejemplo.cl" value={email} onChange={(e) => setEmail(e.target.value)} className={`${fieldClass} flex-1 min-w-[14rem]`} />
        <button type="submit" disabled={busy} className={secondaryBtn}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
          Agregar tesorero
        </button>
      </form>
      <p className="text-xs text-mg-muted">La persona debe tener una cuenta en MedioGol con ese correo.</p>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`text-sm font-bold ${msg.ok ? 'text-mg-pitch-deep' : 'text-mg-danger'}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
};

/** Caja de la liga: ingresos automáticos (pagos de equipos aprobados) + movimientos manuales. */
export const LeagueCashView = ({ league }: { league: { id: string; name: string } }) => {
  const [period, setPeriod] = useState<PeriodKey>('year');
  const [kind, setKind] = useState<CashKind | null>(null);
  const [category, setCategory] = useState<CashCategory | null>(null);
  const [includeVoid, setIncludeVoid] = useState(false);
  const [form, setForm] = useState<CashKind | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const range = useMemo(() => periodRange(period), [period]);
  const { status, overview, movements, hasMore, loadingMore, loadMore, fetchAll, reload } = useLeagueCash(league.id, {
    from: range.from,
    to: range.to,
    kind,
    category,
    includeVoid,
  });

  if (status === 'loading') return <p role="status" className="py-16 text-center text-mg-muted">Cargando la caja…</p>;
  if (status === 'missing')
    return <p className="bg-[#fff4d6] border border-[#e0b84a] rounded-mg-md px-4 py-3 text-sm">La caja de la liga todavía no está activada en la base de datos (falta aplicar la migración 20261127120000_league_cash.sql).</p>;
  if (status === 'denied') return <p className="py-10 text-center text-mg-muted">Solo el administrador de la liga y sus tesoreros ven la caja.</p>;
  if (status === 'error' || !overview)
    return (
      <div role="alert" className="py-10 text-center space-y-2">
        <p className="font-bold">No se pudo cargar la caja.</p>
        <button type="button" onClick={reload} className={secondaryBtn}>Reintentar</button>
      </div>
    );

  const income = overview.income_auto + overview.income_manual;
  const showAuto = kind !== 'out' && !category;

  const openReceipt = async (m: CashMovement) => {
    const { data: path, error } = await supabase.rpc('league_cash_receipt', { p_id: m.id });
    if (error || !path) return setNotice('No se pudo abrir el comprobante.');
    const { data } = await supabase.storage.from('league-receipts').createSignedUrl(path as string, 120);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  };
  const voidMovement = async (m: CashMovement) => {
    const reason = window.prompt(`Anular "${m.description}" (${formatCLP(m.amount)}). Escribe el motivo:`);
    if (reason == null) return;
    const { error } = await supabase.rpc('league_cash_void', { p_id: m.id, p_reason: reason });
    if (error) return setNotice(errorText(error, 'No se pudo anular el movimiento.'));
    setNotice('Movimiento anulado.');
    reload();
  };
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAll();
      const out: (string | number)[][] = [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Serie', 'Medio', 'Monto', 'Estado', 'Registró']];
      rows.forEach((m) =>
        out.push([m.occurred_on, m.kind === 'in' ? 'Ingreso' : 'Egreso', CATEGORY_LABEL[m.category], m.description, m.series || 'Toda la liga', METHOD_LABEL[m.method], m.kind === 'in' ? m.amount : -m.amount, m.status === 'void' ? `Anulado: ${m.void_reason || ''}` : 'Vigente', m.created_by_name || ''])
      );
      if (showAuto) overview.auto.forEach((a) => out.push([`${a.month}`, 'Ingreso', 'Pagos de equipos (automático)', `${a.count} pagos aprobados`, a.series, '', a.total, 'Vigente', 'Cobros']));
      downloadCsv(`caja-${league.name.replace(/[^\w-]+/g, '-').toLowerCase()}-${range.to}.csv`, out);
    } catch (err) {
      console.error('export cash', err);
      setNotice('No se pudo exportar.');
    } finally {
      setExporting(false);
    }
  };

  // Ingresos automáticos agrupados por mes (una fila por mes con el detalle por serie)
  const autoByMonth = showAuto
    ? Object.entries(
        overview.auto.reduce<Record<string, { total: number; count: number; series: string[] }>>((acc, a) => {
          const r = (acc[a.month] ||= { total: 0, count: 0, series: [] });
          r.total += a.total;
          r.count += a.count;
          r.series.push(`${a.series} ${formatCLP(a.total)}`);
          return acc;
        }, {})
      ).sort((a, b) => (a[0] < b[0] ? 1 : -1))
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-bold text-mg-muted">Período</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className={`${fieldClass} w-auto`}>
            {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((k) => (
              <option key={k} value={k}>{PERIOD_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <span className="flex-1" />
        <button type="button" onClick={exportCsv} disabled={exporting} className={secondaryBtn}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          Excel
        </button>
        <button type="button" onClick={() => setForm('out')} className={secondaryBtn}>
          <Minus className="h-4 w-4" aria-hidden="true" /> Egreso
        </button>
        <button type="button" onClick={() => setForm('in')} className={primaryBtn}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Ingreso
        </button>
      </div>

      {form && (
        <CashMovementForm
          key={form}
          leagueId={league.id}
          kind={form}
          series={overview.series}
          onCancel={() => setForm(null)}
          onDone={() => {
            setForm(null);
            setNotice(form === 'in' ? 'Ingreso registrado.' : 'Egreso registrado.');
            reload();
          }}
        />
      )}
      {notice && (
        <p role="status" className="flex items-center justify-between gap-2 bg-mg-pitch-tint border border-[#bfe3cb] rounded-mg-md px-4 py-2 text-sm font-bold">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="h-8 w-8 inline-flex items-center justify-center" aria-label="Cerrar aviso">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </p>
      )}

      <section aria-label="Resumen de la caja" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Ingresos" value={formatCLP(income)} tone="good" hint={`${formatCLP(overview.income_auto)} de pagos de equipos`} />
        <Tile label="Egresos" value={formatCLP(overview.expense)} tone={overview.expense > 0 ? 'danger' : 'default'} hint={PERIOD_LABEL[period]} />
        <Tile label="Saldo en caja" value={formatCLP(overview.balance)} tone={overview.balance < 0 ? 'danger' : 'default'} hint={`Al ${formatDay(overview.to)}`} />
        <Tile label="Por cobrar a equipos" value={formatCLP(overview.receivable)} tone={overview.receivable > 0 ? 'warn' : 'default'} hint="Deudas de hoy" />
      </section>

      <MonthBars months={overview.months} />

      <section aria-labelledby="movements-title" className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-mg-line">
          <h2 id="movements-title" className="font-extrabold flex-1">Movimientos</h2>
          <label className="sr-only" htmlFor="cash-kind">Tipo</label>
          <select id="cash-kind" value={kind ?? ''} onChange={(e) => { setKind((e.target.value || null) as CashKind | null); setCategory(null); }} className={`${fieldClass} w-auto min-h-[40px] text-sm`}>
            <option value="">Ingresos y egresos</option>
            <option value="in">Solo ingresos</option>
            <option value="out">Solo egresos</option>
          </select>
          <label className="sr-only" htmlFor="cash-category">Categoría</label>
          <select id="cash-category" value={category ?? ''} onChange={(e) => setCategory((e.target.value || null) as CashCategory | null)} className={`${fieldClass} w-auto min-h-[40px] text-sm`}>
            <option value="">Todas las categorías</option>
            {[...(kind !== 'out' ? IN_CATEGORIES : []), ...(kind !== 'in' ? OUT_CATEGORIES : [])].map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm font-semibold min-h-[40px]">
            <input type="checkbox" checked={includeVoid} onChange={(e) => setIncludeVoid(e.target.checked)} className="h-4 w-4" /> Ver anulados
          </label>
        </div>
        {movements.length === 0 && autoByMonth.length === 0 ? (
          <p className="px-4 py-10 text-center text-mg-muted">No hay movimientos en este período. Registra el primero con "Ingreso" o "Egreso".</p>
        ) : (
          <ul className="divide-y divide-mg-line">
            {autoByMonth.map(([month, a]) => (
              <li key={`auto-${month}`} className="flex items-start gap-3 px-4 py-3 bg-mg-surface-2">
                <span className="w-16 flex-none text-xs font-bold text-mg-muted pt-0.5">{monthLabel(month)}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-bold">
                    Pagos de equipos aprobados ({a.count})
                    <span className={`${CHIP} bg-[#e3eefc] text-[#0c447c]`}>Automático</span>
                  </span>
                  <span className="block text-xs text-mg-muted truncate">{a.series.join(' · ')}</span>
                </span>
                <span className="mg-num font-extrabold text-mg-pitch-deep whitespace-nowrap">+{formatCLP(a.total)}</span>
              </li>
            ))}
            {movements.map((m) => (
              <li key={m.id} className={`flex items-start gap-3 px-4 py-3 ${m.status === 'void' ? 'opacity-60' : ''}`}>
                <span className="w-16 flex-none text-xs font-bold text-mg-muted pt-0.5">{formatDay(m.occurred_on).replace(/ de /g, ' ')}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-bold">
                    <span className={m.status === 'void' ? 'line-through' : ''}>{m.description}</span>
                    <span className={`${CHIP} ${m.kind === 'in' ? 'bg-mg-pitch-tint text-mg-pitch-deep' : 'bg-mg-danger-tint text-mg-danger'}`}>{CATEGORY_LABEL[m.category]}</span>
                    {m.status === 'void' && <span className={`${CHIP} bg-mg-surface-2 text-mg-muted`}>Anulado</span>}
                  </span>
                  <span className="block text-xs text-mg-muted">
                    {METHOD_LABEL[m.method]}
                    {m.series ? ` · ${m.series}` : ''}
                    {m.created_by_name ? ` · registró ${m.created_by_name}` : ''}
                    {m.status === 'void' && m.void_reason ? ` · motivo: ${m.void_reason}` : ''}
                  </span>
                  <span className="flex flex-wrap gap-1 -ml-2">
                    {m.has_receipt && (
                      <button type="button" onClick={() => openReceipt(m)} className="inline-flex items-center gap-1 min-h-[36px] px-2 text-sm font-bold text-mg-pitch-deep">
                        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" /> Comprobante
                      </button>
                    )}
                    {m.status === 'active' && (
                      <button type="button" onClick={() => voidMovement(m)} className={dangerLink}>
                        Anular
                      </button>
                    )}
                  </span>
                </span>
                <span className={`mg-num font-extrabold whitespace-nowrap ${m.kind === 'in' ? 'text-mg-pitch-deep' : 'text-mg-danger'}`}>
                  {m.kind === 'in' ? '+' : '−'}
                  {formatCLP(m.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="px-4 py-3 border-t border-mg-line text-center">
            <button type="button" onClick={loadMore} disabled={loadingMore} className={secondaryBtn}>
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Ver más
            </button>
          </div>
        )}
      </section>

      {overview.role === 'admin' && overview.treasurers && <Treasurers leagueId={league.id} list={overview.treasurers} onChanged={reload} />}
    </div>
  );
};
