import { FormEvent, useState } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CashCategory, CashKind } from '../../types/leagueCash';
import { PaymentMethod } from '../../types/payments';
import { prepareImage } from '../../utils/matchSheet';
import { todayCL } from '../../utils/money';
import { CATEGORY_LABEL, IN_CATEGORIES, OUT_CATEGORIES } from '../../utils/leagueCash';
import { Field, METHOD_LABEL, MoneyInput, errorText, fieldClass, primaryBtn, secondaryBtn } from './PaymentsUi';

interface Props {
  leagueId: string;
  kind: CashKind;
  series: { id: string; label: string }[];
  onDone: () => void;
  onCancel: () => void;
}

const MAX_PDF = 5 * 1024 * 1024;

/** Registrar un ingreso o un egreso manual de la caja de la liga. */
export const CashMovementForm = ({ leagueId, kind, series, onDone, onCancel }: Props) => {
  const cats = kind === 'in' ? IN_CATEGORIES : OUT_CATEGORIES;
  const [category, setCategory] = useState<CashCategory>(cats[0]);
  const [amount, setAmount] = useState<number | null>(null);
  const [day, setDay] = useState(todayCL());
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('transfer');
  const [championship, setChampionship] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (): Promise<string | null> => {
    if (!file) return null;
    const isPdf = file.type === 'application/pdf';
    if (isPdf && file.size > MAX_PDF) throw new Error('El PDF supera 5 MB.');
    const body = isPdf ? file : await prepareImage(file);
    const path = `${leagueId}/${crypto.randomUUID()}.${isPdf ? 'pdf' : 'jpg'}`;
    const { error: upError } = await supabase.storage.from('league-receipts').upload(path, body, { contentType: isPdf ? 'application/pdf' : 'image/jpeg' });
    if (upError) throw new Error('No se pudo subir el comprobante.');
    return path;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) return setError('Ingresa el monto.');
    if (!description.trim()) return setError('Escribe una descripción.');
    setSaving(true);
    setError(null);
    try {
      const receipt = await upload();
      const { error: rpcError } = await supabase.rpc('league_cash_add', {
        p_league: leagueId,
        p_kind: kind,
        p_category: category,
        p_amount: amount,
        p_occurred_on: day,
        p_description: description.trim(),
        p_method: method,
        p_championship: championship || null,
        p_receipt_path: receipt,
      });
      if (rpcError) throw rpcError;
      onDone();
    } catch (err) {
      console.error('league_cash_add', err);
      setError(err instanceof Error && !(err as { code?: string }).code ? err.message : errorText(err, 'No se pudo guardar el movimiento.'));
    } finally {
      setSaving(false);
    }
  };

  const title = kind === 'in' ? 'Registrar ingreso' : 'Registrar egreso';
  return (
    <form onSubmit={submit} className="bg-mg-surface border border-mg-line rounded-mg-lg p-5 space-y-4" aria-labelledby="cash-form-title">
      <h3 id="cash-form-title" className="text-lg font-extrabold">{title}</h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Categoría">
          {(id) => (
            <select id={id} value={category} onChange={(e) => setCategory(e.target.value as CashCategory)} className={fieldClass}>
              {cats.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Monto">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} required />}</Field>
        <Field label="Fecha">{(id) => <input id={id} type="date" required max={todayCL()} value={day} onChange={(e) => setDay(e.target.value)} className={fieldClass} />}</Field>
        <Field label="Medio">
          {(id) => (
            <select id={id} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={fieldClass}>
              {(['transfer', 'cash', 'other'] as const).map((m) => (
                <option key={m} value={m}>{METHOD_LABEL[m]}</option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label="Descripción" hint={kind === 'in' ? 'Ej.: Auspicio Ferretería Central, temporada 2026.' : 'Ej.: Arriendo cancha Mundo Nuevo, fecha 8.'}>
        {(id) => <input id={id} required maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} />}
      </Field>
      {series.length > 1 && (
        <Field label="Serie (opcional)" hint="Solo si el movimiento es de una serie en particular.">
          {(id) => (
            <select id={id} value={championship} onChange={(e) => setChampionship(e.target.value)} className={fieldClass}>
              <option value="">Toda la liga</option>
              {series.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          )}
        </Field>
      )}
      <div className="space-y-1">
        <label className={`${secondaryBtn} cursor-pointer`}>
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          {file ? 'Cambiar comprobante' : 'Adjuntar comprobante (opcional)'}
          <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {file && <p className="text-sm text-mg-muted truncate">{file.name}</p>}
      </div>
      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}
      <div className="flex flex-wrap gap-3 justify-end">
        <button type="button" onClick={onCancel} className={secondaryBtn}>Cancelar</button>
        <button type="submit" disabled={saving} className={primaryBtn}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {title}
        </button>
      </div>
    </form>
  );
};
