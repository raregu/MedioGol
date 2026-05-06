import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { PlayerCredential, ValidationResult } from '../types/database';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Shield, User, CheckCircle2, XCircle, Clock, AlertTriangle,
  Camera, Search, Trophy, Calendar, CameraOff
} from 'lucide-react';

export const ValidatePlayer = () => {
  const { profile } = useAuth();
  const [qrToken, setQrToken] = useState('');
  const [playerData, setPlayerData] = useState<PlayerCredential | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const startScanner = async () => {
    setError('');
    setScanning(true);
    await new Promise(resolve => setTimeout(resolve, 100));
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          scanner.stop().then(() => {
            setScanning(false);
            const token = decodedText.includes('MG-') ? decodedText : decodedText;
            setQrToken(token);
            handleSearchWithToken(token);
          });
        },
        () => {}
      );
    } catch {
      setScanning(false);
      setError('No se pudo acceder a la cámara. Verifica los permisos.');
    }
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {}).finally(() => {
        setScanning(false);
      });
    }
  };

  const isAuthorized = profile && ['admin_sistema', 'admin_campeonato', 'encargado_turno'].includes(profile.role);

  const handleSearchWithToken = async (token: string) => {
    setLoading(true);
    setError('');
    setPlayerData(null);
    setValidationResult(null);
    setNotes('');

    try {
      const { data, error: fetchError } = await supabase
        .from('player_profiles')
        .select(`
          id,
          full_name,
          rut,
          date_of_birth,
          photo_url,
          position,
          estado_verificacion,
          foto_bloqueada,
          qr_token,
          fecha_primer_partido
        `)
        .eq('qr_token', token.trim())
        .single();

      if (fetchError || !data) {
        setError('Jugador no encontrado. Verifica el código QR.');
        return;
      }

      const { data: teamData } = await supabase
        .from('base_team_players')
        .select('base_teams(name, logo_url)')
        .eq('player_id', data.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const playerCredential: PlayerCredential = {
        ...data,
        team_name: teamData?.base_teams?.name || 'Sin equipo',
        team_logo: teamData?.base_teams?.logo_url,
      };

      setPlayerData(playerCredential);
    } catch (err) {
      console.error('Error searching player:', err);
      setError('Error al buscar jugador. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!qrToken.trim()) {
      setError('Ingresa un código QR válido');
      return;
    }

    setLoading(true);
    setError('');
    setPlayerData(null);
    setValidationResult(null);
    setNotes('');

    try {
      const { data, error: fetchError } = await supabase
        .from('player_profiles')
        .select(`
          id,
          full_name,
          rut,
          date_of_birth,
          photo_url,
          position,
          estado_verificacion,
          foto_bloqueada,
          qr_token,
          fecha_primer_partido
        `)
        .eq('qr_token', qrToken.trim())
        .single();

      if (fetchError || !data) {
        setError('Jugador no encontrado. Verifica el código QR.');
        return;
      }

      const { data: teamData } = await supabase
        .from('base_team_players')
        .select('base_teams(name, logo_url)')
        .eq('player_id', data.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const playerCredential: PlayerCredential = {
        ...data,
        team_name: teamData?.base_teams?.name || 'Sin equipo',
        team_logo: teamData?.base_teams?.logo_url,
      };

      setPlayerData(playerCredential);
    } catch (err) {
      console.error('Error searching player:', err);
      setError('Error al buscar jugador. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleValidation = async (result: ValidationResult) => {
    if (!playerData || !profile) return;

    setSubmitting(true);
    try {
      const { error: logError } = await supabase
        .from('player_validation_logs')
        .insert({
          player_id: playerData.id,
          validated_by: profile.id,
          validation_result: result,
          notas: notes.trim() || null,
        });

      if (logError) throw logError;

      setValidationResult(result);
    } catch (err) {
      console.error('Error saving validation:', err);
      setError('Error al guardar la validación. Intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verificado':
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl font-bold shadow-lg">
            <CheckCircle2 className="h-5 w-5" />
            <span>Verificado</span>
          </div>
        );
      case 'rechazado':
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl font-bold shadow-lg">
            <XCircle className="h-5 w-5" />
            <span>Rechazado</span>
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-xl font-bold shadow-lg">
            <Clock className="h-5 w-5" />
            <span>Pendiente</span>
          </div>
        );
    }
  };

  if (!isAuthorized) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-black text-gray-900 mb-2">Acceso Restringido</h2>
            <p className="text-gray-600">Solo administradores y encargados de turno pueden validar jugadores.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
          <div className="inline-block p-4 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl mb-4">
            <Shield className="h-12 w-12 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-3">Validación en Cancha</h1>
          <p className="text-gray-600 text-lg font-medium">Escanea el QR del jugador para verificar su identidad</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-100">
          <div className="space-y-6">

            {/* Botón escanear cámara */}
            {!scanning && !loading && (
              <button
                onClick={startScanner}
                className="w-full flex items-center justify-center gap-3 py-5 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-2xl hover:from-blue-600 hover:to-blue-800 transition-all font-bold text-lg shadow-lg hover:shadow-xl"
              >
                <Camera className="h-7 w-7" />
                Escanear QR con Cámara
              </button>
            )}

            {loading && (
              <div className="w-full flex items-center justify-center gap-3 py-5 bg-blue-50 rounded-2xl border-2 border-blue-200">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                <span className="font-bold text-blue-700">Buscando jugador...</span>
              </div>
            )}

            {/* Visor de cámara */}
            {scanning && (
              <div className="space-y-4">
                <div id="qr-reader" className="w-full rounded-2xl overflow-hidden" />
                <button
                  onClick={stopScanner}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all font-bold"
                >
                  <CameraOff className="h-5 w-5" />
                  Cancelar
                </button>
              </div>
            )}

            {/* Búsqueda manual como alternativa */}
            {!scanning && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">O ingresa el código manualmente</p>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={qrToken}
                      onChange={(e) => setQrToken(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="MG-xxxxxxxxxxxxxxxx"
                      className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="px-6 py-4 bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition-all font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Buscar
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800 font-semibold">{error}</p>
              </div>
            )}
          </div>
        </div>

        {playerData && !validationResult && (
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl p-8 border-4 border-blue-500">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-shrink-0">
                {playerData.photo_url ? (
                  <img
                    src={playerData.photo_url}
                    alt={playerData.full_name}
                    className="w-48 h-48 object-cover rounded-2xl border-4 border-blue-500 shadow-2xl"
                  />
                ) : (
                  <div className="w-48 h-48 bg-gray-700 rounded-2xl flex items-center justify-center border-4 border-blue-500">
                    <User className="h-24 w-24 text-gray-500" />
                  </div>
                )}
              </div>

              <div className="flex-1 text-white space-y-6">
                <div>
                  <p className="text-blue-400 text-sm font-bold uppercase tracking-wider mb-2">Nombre Completo</p>
                  <h2 className="text-3xl font-black">{playerData.full_name}</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-blue-400 text-sm font-bold uppercase tracking-wider mb-2">Equipo</p>
                    <div className="flex items-center gap-2">
                      {playerData.team_logo && (
                        <img src={playerData.team_logo} alt="" className="w-6 h-6 rounded" />
                      )}
                      <p className="text-lg font-bold">{playerData.team_name}</p>
                    </div>
                  </div>

                  {playerData.position && (
                    <div>
                      <p className="text-blue-400 text-sm font-bold uppercase tracking-wider mb-2">Posición</p>
                      <p className="text-lg font-bold">{playerData.position}</p>
                    </div>
                  )}

                  {playerData.rut && (
                    <div>
                      <p className="text-blue-400 text-sm font-bold uppercase tracking-wider mb-2">RUT/DNI</p>
                      <p className="text-lg font-bold">{playerData.rut}</p>
                    </div>
                  )}

                  {playerData.date_of_birth && (
                    <div>
                      <p className="text-blue-400 text-sm font-bold uppercase tracking-wider mb-2">Fecha Nacimiento</p>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-400" />
                        <p className="text-lg font-bold">
                          {new Date(playerData.date_of_birth).toLocaleDateString('es-ES')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-blue-400 text-sm font-bold uppercase tracking-wider mb-3">Estado</p>
                  {getStatusBadge(playerData.estado_verificacion)}
                </div>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t-2 border-gray-700 space-y-6">
              <div className="bg-yellow-500/20 border-2 border-yellow-500 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Camera className="h-6 w-6 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-yellow-400 mb-1">Importante</p>
                    <p className="text-sm text-gray-300">
                      Compara visualmente la foto con el rostro del jugador antes de validar.
                      Asegúrate de que la identidad coincida.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-blue-400 text-sm font-bold uppercase tracking-wider mb-3">
                  Notas (Opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Añade cualquier observación sobre la validación..."
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-800 border-2 border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-white placeholder-gray-500"
                />
              </div>

              <div className="flex flex-col md:flex-row gap-4">
                <button
                  onClick={() => handleValidation('aprobado')}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="h-6 w-6" />
                  <span>Jugador Válido</span>
                </button>

                <button
                  onClick={() => handleValidation('sospechoso')}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-xl hover:from-yellow-600 hover:to-yellow-700 transition-all font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <AlertTriangle className="h-6 w-6" />
                  <span>Sospechoso</span>
                </button>

                <button
                  onClick={() => handleValidation('rechazado')}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <XCircle className="h-6 w-6" />
                  <span>Rechazar</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {validationResult && (
          <div className={`rounded-2xl shadow-2xl p-8 border-4 text-center ${
            validationResult === 'aprobado'
              ? 'bg-green-50 border-green-500'
              : validationResult === 'sospechoso'
              ? 'bg-yellow-50 border-yellow-500'
              : 'bg-red-50 border-red-500'
          }`}>
            {validationResult === 'aprobado' && (
              <>
                <CheckCircle2 className="h-20 w-20 text-green-600 mx-auto mb-4" />
                <h3 className="text-3xl font-black text-gray-900 mb-3">Validación Exitosa</h3>
                <p className="text-gray-700 text-lg font-medium">
                  El jugador {playerData?.full_name} ha sido validado correctamente.
                </p>
              </>
            )}
            {validationResult === 'sospechoso' && (
              <>
                <AlertTriangle className="h-20 w-20 text-yellow-600 mx-auto mb-4" />
                <h3 className="text-3xl font-black text-gray-900 mb-3">Marcado como Sospechoso</h3>
                <p className="text-gray-700 text-lg font-medium">
                  La validación de {playerData?.full_name} requiere revisión adicional.
                </p>
              </>
            )}
            {validationResult === 'rechazado' && (
              <>
                <XCircle className="h-20 w-20 text-red-600 mx-auto mb-4" />
                <h3 className="text-3xl font-black text-gray-900 mb-3">Validación Rechazada</h3>
                <p className="text-gray-700 text-lg font-medium">
                  La identidad de {playerData?.full_name} no pudo ser verificada.
                </p>
              </>
            )}

            <button
              onClick={() => {
                setPlayerData(null);
                setValidationResult(null);
                setQrToken('');
                setNotes('');
                setError('');
              }}
              className="mt-6 px-8 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-bold shadow-lg"
            >
              Validar Otro Jugador
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};
