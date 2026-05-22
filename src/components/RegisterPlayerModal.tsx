import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, User, Hash, Phone, Mail, Key, CheckCircle, Copy, AlertCircle, Loader2 } from 'lucide-react';

interface RegisterPlayerModalProps {
  baseTeamId: string;
  baseTeamName: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface SuccessData {
  player_id: string;
  full_name: string;
  password: string;
  generated_email: string | null;
  real_email: string | null;
  rut: string;
  already_exists: boolean;
}

// Validación de RUT chileno (Módulo 11)
function validateRUT(rut: string): boolean {
  const cleaned = rut.replace(/[.\-\s]/g, '').toUpperCase();
  if (cleaned.length < 2) return false;

  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);

  if (!/^\d+$/.test(body)) return false;

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  let expectedDV: string;
  if (remainder === 11) expectedDV = '0';
  else if (remainder === 10) expectedDV = 'K';
  else expectedDV = remainder.toString();

  return dv === expectedDV;
}

// Formatea el RUT con puntos y guión
function formatRUT(value: string): string {
  const cleaned = value.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleaned.length === 0) return '';

  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);

  if (body.length === 0) return dv;

  // Agregar puntos cada 3 dígitos desde la derecha
  let formatted = '';
  for (let i = body.length - 1, count = 0; i >= 0; i--, count++) {
    if (count > 0 && count % 3 === 0) formatted = '.' + formatted;
    formatted = body[i] + formatted;
  }

  return `${formatted}-${dv}`;
}

export function RegisterPlayerModal({ baseTeamId, baseTeamName, onClose, onSuccess }: RegisterPlayerModalProps) {
  const [formData, setFormData] = useState({
    full_name: '',
    rut: '',
    phone: '',
    email: '',
  });
  const [rutError, setRutError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [copied, setCopied] = useState(false);

  const handleRutChange = (value: string) => {
    const formatted = formatRUT(value);
    setFormData((prev) => ({ ...prev, rut: formatted }));

    // Validar solo cuando hay suficiente input
    const cleaned = value.replace(/[^0-9kK]/g, '');
    if (cleaned.length >= 7) {
      if (!validateRUT(formatted)) {
        setRutError('RUT inválido');
      } else {
        setRutError(null);
      }
    } else {
      setRutError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validaciones
    if (!formData.full_name.trim()) {
      setFormError('El nombre completo es requerido');
      return;
    }

    if (!formData.rut.trim()) {
      setFormError('El RUT es requerido');
      return;
    }

    if (!validateRUT(formData.rut)) {
      setFormError('El RUT ingresado no es válido');
      return;
    }

    if (!formData.email.trim() && !formData.phone.trim()) {
      setFormError('Debes ingresar al menos correo o teléfono');
      return;
    }

    setLoading(true);
    setFormError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error('No hay sesión activa. Por favor recarga la página e inicia sesión.');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Error de configuración: URL de Supabase no definida');
      }

      console.log('[RegisterPlayer] Llamando a edge function...', { supabaseUrl, baseTeamId });

      const response = await fetch(`${supabaseUrl}/functions/v1/register-player`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: formData.full_name.trim(),
          rut: formData.rut.trim(),
          phone: formData.phone.trim() || undefined,
          email: formData.email.trim() || undefined,
          base_team_id: baseTeamId,
        }),
      });

      console.log('[RegisterPlayer] Respuesta HTTP:', response.status, response.statusText);

      let result: any;
      try {
        result = await response.json();
      } catch {
        throw new Error(`Error del servidor (${response.status}): respuesta inválida`);
      }

      console.log('[RegisterPlayer] Resultado:', result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.message || `Error ${response.status}: ${response.statusText}`);
      }

      setSuccessData(result);
      onSuccess();
    } catch (err: any) {
      console.error('[RegisterPlayer] Error:', err);
      setFormError(err.message || 'Error al registrar el jugador. Revisa la consola (F12) para más detalles.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleClose = () => {
    if (!loading) onClose();
  };

  // Pantalla de éxito
  if (successData) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
          <div className="p-6">
            {/* Header éxito */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-9 w-9 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">
                {successData.already_exists ? '¡Jugador agregado!' : '¡Jugador registrado!'}
              </h2>
              <p className="text-gray-600 mt-1">
                {successData.full_name} ha sido {successData.already_exists ? 'agregado' : 'registrado'} en {baseTeamName}
              </p>
            </div>

            {!successData.already_exists && (
              <>
                {/* Credenciales */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                  <p className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Credenciales de acceso — guárdalas ahora
                  </p>

                  <div className="space-y-3">
                    {/* Email o email generado */}
                    <div>
                      <p className="text-xs text-gray-500 mb-1">
                        {successData.generated_email ? 'Correo generado (sin correo real)' : 'Correo'}
                      </p>
                      <div className="flex items-center gap-2 bg-white border border-amber-300 rounded-lg px-3 py-2">
                        <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="flex-1 text-sm font-mono text-gray-800 break-all">
                          {successData.generated_email || successData.real_email}
                        </span>
                      </div>
                      {successData.generated_email && (
                        <p className="text-xs text-amber-700 mt-1">
                          Este es el correo del sistema. El jugador usa RUT + contraseña para ingresar.
                        </p>
                      )}
                    </div>

                    {/* Contraseña */}
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Contraseña inicial (6 dígitos)</p>
                      <div className="flex items-center gap-2 bg-white border border-amber-300 rounded-lg px-3 py-2">
                        <Key className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="flex-1 text-2xl font-bold font-mono tracking-widest text-gray-900">
                          {successData.password}
                        </span>
                        <button
                          onClick={() => copyToClipboard(successData.password)}
                          className="text-amber-600 hover:text-amber-800 transition-colors"
                          title="Copiar contraseña"
                        >
                          {copied ? <CheckCircle className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-blue-800">
                    <strong>Importante:</strong> Entrega esta contraseña al jugador. Podrá cambiarla después de iniciar sesión.
                    {successData.generated_email && (
                      <> El jugador puede ingresar con el correo generado o con su RUT.</>
                    )}
                  </p>
                </div>
              </>
            )}

            <button
              onClick={handleClose}
              className="w-full px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Registrar Nuevo Jugador</h2>
            <p className="text-sm text-gray-500">{baseTeamName}</p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Nombre completo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre Completo <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
                placeholder="Juan Pérez González"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                disabled={loading}
              />
            </div>
          </div>

          {/* RUT */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              RUT <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={formData.rut}
                onChange={(e) => handleRutChange(e.target.value)}
                placeholder="12.345.678-9"
                maxLength={12}
                className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm ${
                  rutError ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
                disabled={loading}
              />
            </div>
            {rutError && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {rutError}
              </p>
            )}
            {!rutError && formData.rut.length >= 9 && validateRUT(formData.rut) && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                RUT válido
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">Formato: 12.345.678-9 (con dígito verificador)</p>
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono{' '}
              <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+56 9 1234 5678"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                disabled={loading}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Correo electrónico{' '}
              <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="jugador@ejemplo.com"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                disabled={loading}
              />
            </div>
          </div>

          {/* Aviso sin email */}
          {!formData.email && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                <strong>Sin correo:</strong> Se generará un correo de sistema basado en el RUT del jugador.
                El jugador podrá ingresar con ese correo y la contraseña asignada.
              </p>
            </div>
          )}

          {/* Requisito mínimo */}
          {!formData.email && !formData.phone && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800">
                Se requiere al menos correo o teléfono para registrar al jugador.
              </p>
            </div>
          )}

        </form>

        {/* Footer — error siempre visible aquí */}
        <div className="border-t px-6 py-4 space-y-3">
          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {formError}
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                'Registrar Jugador'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
