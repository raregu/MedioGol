import { FormEvent, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ChargeConcept } from '../../types/payments';
import { todayCL } from '../../utils/money';
import { CONCEPT_LABEL, Field, MoneyInput, errorText, fieldClass, primaryBtn, secondaryBtn } from './PaymentsUi';

interface Props {
  teamId: string;
  walkoverFine: number;
  onDone: () => void;
  onCancel: () => void;
}

const MANUAL: ChargeConcept[] = ['walkover', 'deposit', 'other', 'registration', 'referee', 'yellow_card', 'red_card'];

/** Cargo manual (W.O., garantía, otros). Los automáticos los genera el servidor. */
export const ChargeForm = ({ teamId, walkoverFine, onDone, onCancel }: Props) => {
  const [concept, setConcept] = useState<ChargeConcept>('walkover');
  const [description, setDescription] = useState(CONCEPT_LABEL.walkover);
  const [amount, setAmount] = useState<number | null>(walkoverFine > 0 ? walkoverFine : null);
  const [dueDate, setDueDate] = useState(todayCL());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeConcept = (c: ChargeConcept) => {
    if (!description.trim() || description === CONCEPT_LABEL[concept]) setDescription(CONCEPT_LABEL[c]);
    if (c === 'walkover' && walkoverFine > 0 && !amount) setAmount(walkoverFine);
    setConcept(c);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) return setError('Ingresa el monto.');
    if (!description.trim()) return setError('Escribe una descripción.');
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('add_team_charge', {
      p_team_id: teamId,
      p_concept: concept,
      p_description: description.trim(),
      p_amount: amount,
      p_due_date: dueDate || null,
    });
    setSaving(false);
    if (rpcError) {
      console.error('add_team_charge', rpcError);
      return setError(errorText(rpcError, 'No se pudo agregar el cargo.'));
    }
    onDone();
  };

  return (
    <form onSubmit={submit} className="bg-mg-surface border border-mg-line rounded-mg-lg p-5 space-y-4" aria-labelledby="charge-form-title">
      <h3 id="charge-form-title" className="text-lg font-extrabold">Agregar cargo</h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Concepto">
          {(id) => (
            <select id={id} value={concept} onChange={(e) => changeConcept(e.target.value as ChargeConcept)} className={fieldClass}>
              {MANUAL.map((c) => <option key={c} value={c}>{CONCEPT_LABEL[c]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Descripción">{(id) => <input id={id} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} />}</Field>
        <Field label="Monto">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} required />}</Field>
        <Field label="Vence">{(id) => <input id={id} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={fieldClass} />}</Field>
      </div>
      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}
      <div className="flex flex-wrap gap-3 justify-end">
        <button type="button" onClick={onCancel} className={secondaryBtn}>Cancelar</button>
        <button type="submit" disabled={saving} className={primaryBtn}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Agregar cargo
        </button>
      </div>
    </form>
  );
};
