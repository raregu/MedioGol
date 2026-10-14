import { FormEvent, useState } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PaymentMethod } from '../../types/payments';
import { prepareImage } from '../../utils/matchSheet';
import { todayCL } from '../../utils/money';
import { Field, METHOD_LABEL, MoneyInput, errorText, fieldClass, primaryBtn, secondaryBtn } from './PaymentsUi';

interface Props {
  championshipId: string;
  teamId: string;
  /** Personal: el pago queda aprobado. Capitán: queda por revisar y el comprobante es obligatorio. */
  asStaff: boolean;
  suggestedAmount?: number;
  onDone: () => void;
  onCancel: () => void;
}

const MAX_PDF = 5 * 1024 * 1024;

export const PaymentForm = ({ championshipId, teamId, asStaff, suggestedAmount, onDone, onCancel }: Props) => {
  const [amount, setAmount] = useState<number | null>(suggestedAmount && suggestedAmount > 0 ? suggestedAmount : null);
  const [paidOn, setPaidOn] = useState(todayCL());
  const [method, setMethod] = useState<PaymentMethod>(asStaff ? 'cash' : 'transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadReceipt = async (): Promise<string | null> => {
    if (!file) return null;
    const isPdf = file.type === 'application/pdf';
    if (isPdf && file.size > MAX_PDF) throw new Error('El PDF supera 5 MB.');
    const body = isPdf ? file : await prepareImage(file);
    const path = `${championshipId}/${teamId}/${crypto.randomUUID()}.${isPdf ? 'pdf' : 'jpg'}`;
    const { error: upError } = await supabase.storage
      .from('payment-receipts')
      .upload(path, body, { contentType: isPdf ? 'application/pdf' : 'image/jpeg' });
    if (upError) throw new Error('No se pudo subir el comprobante.');
    return path;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) return setError('Ingresa el monto.');
    if (!asStaff && !file) return setError('Adjunta la foto o PDF del comprobante.');
    setSaving(true);
    setError(null);
    try {
      const receiptPath = await uploadReceipt();
      const { error: rpcError } = await supabase.rpc('record_team_payment', {
        p_team_id: teamId,
        p_amount: amount,
        p_paid_on: paidOn,
        p_method: method,
        p_reference: reference.trim() || null,
        p_note: note.trim() || null,
        p_receipt_path: receiptPath,
      });
      if (rpcError) throw rpcError;
      onDone();
    } catch (err) {
      console.error('record_team_payment', err);
      setError(err instanceof Error && !(err as { code?: string }).code ? err.message : errorText(err, 'No se pudo registrar el pago.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-mg-surface border border-mg-line rounded-mg-lg p-5 space-y-4" aria-labelledby="payment-form-title">
      <h3 id="payment-form-title" className="text-lg font-extrabold">{asStaff ? 'Registrar pago' : 'Informar un pago'}</h3>
      {!asStaff && <p className="text-sm text-mg-muted">El campeonato revisará el comprobante. Mientras tanto aparecerá como "por revisar".</p>}
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Monto">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} required />}</Field>
        <Field label="Fecha del pago">{(id) => <input id={id} type="date" required max={todayCL()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={fieldClass} />}</Field>
        <Field label="Medio">
          {(id) => (
            <select id={id} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={fieldClass}>
              {(asStaff ? (['cash', 'transfer', 'other'] as const) : (['transfer', 'other'] as const)).map((m) => (
                <option key={m} value={m}>{METHOD_LABEL[m]}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="N° de operación o recibo (opcional)">
          {(id) => <input id={id} maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} className={fieldClass} />}
        </Field>
      </div>
      <Field label="Nota (opcional)" hint="Ej.: qué cuota o multa se está pagando.">
        {(id) => <input id={id} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} />}
      </Field>
      <div className="space-y-1">
        <label className={`${secondaryBtn} cursor-pointer`}>
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          {file ? 'Cambiar comprobante' : asStaff ? 'Adjuntar comprobante (opcional)' : 'Adjuntar comprobante'}
          <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {file && <p className="text-sm text-mg-muted truncate">{file.name}</p>}
      </div>
      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}
      <div className="flex flex-wrap gap-3 justify-end">
        <button type="button" onClick={onCancel} className={secondaryBtn}>Cancelar</button>
        <button type="submit" disabled={saving} className={primaryBtn}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {asStaff ? 'Registrar pago' : 'Enviar comprobante'}
        </button>
      </div>
    </form>
  );
};
