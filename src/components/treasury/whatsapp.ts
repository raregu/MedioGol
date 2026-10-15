import { formatCLP } from '../../utils/money';

/**
 * Recordatorio por WhatsApp sin usar el teléfono del jugador (dato personal):
 * abre WhatsApp con el mensaje listo y el tesorero elige el contacto.
 */
export const whatsappReminder = (team: string, playerName: string, balance: number, overdue: number) => {
  const first = playerName.trim().split(/\s+/)[0] || '';
  const text =
    `Hola ${first}, te escribo por la tesorería de ${team}. ` +
    `Tu saldo pendiente es ${formatCLP(balance)}` +
    (overdue > 0 ? ` (${formatCLP(overdue)} vencido)` : '') +
    '. Puedes ver el detalle en MedioGol → Mis equipos. ¡Gracias!';
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
};
