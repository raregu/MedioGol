import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { PlayerCredential, ValidationResult } from '../types/database';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Shield, User, CheckCircle2, XCircle, Clock, AlertTriangle,
  Camera, Search, Calendar, CameraOff, QrCode, CreditCard, ScanLine
} from 'lucide-react';

type ScanMode = 'select' | 'qr' | 'cedula';

export const ValidatePlayer = () => {
  const { profile } = useAuth();
  const [mode, setMode] = useState<ScanMode>('select');
  const [qrToken, setQrToken] = useState('');
  const [rutSearch, setRutSearch] = useState('');
  const [playerData, setPlayerData] = useState<PlayerCredential | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isAuthorized = profile && ['admin_sistema', 'admin_campeonato', 'encargado_turno'].includes(profile.role);

  useEffect(() => {
    return () => {
      stopAllCameras();
    };
  }, []);

  const stopAllCameras = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const resetAll = () => {
    stopAllCameras();
    setPlayerData(null);
    setValidationResult(null);
    setQrToken('');
    setRutSearch('');
    setNotes('');
    setError('');
    setScanning(false);
    setOcrLoading(false);
    setOcrStatus('');
    setMode('select');
  };

  // ─── QR SCANNER ───────────────────────────────────────────
  const startQrScanner = async () => {
    setError('');
    setScanning(true);
    await new Promise(r => setTimeout(r, 100));
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          scanner.stop().then(() => {
            setScanning(false);
            setQrToken(decodedText);
            searchByQr(decodedText);
          });
        },
        () => {}
      );
    } catch {
      setScanning(false);
      setError('No se pudo acceder a la cámara. Verifica los permisos.');
    }
  };

  const stopQrScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {}).finally(() => setScanning(false));
    }
  };

  const searchByQr = async (token: string) => {
    if (!token.trim()) { setError('Ingresa un código QR válido'); return; }
    setLoading(true);
    setError('');
    setPlayerData(null);
    setValidationResult(null);
    try {
      // Extraer token si viene como URL completa
      const rawToken = token.includes('/validate/') ? token.split('/validate/')[1] : token.trim();

      const { data, error: fetchError } = await supabase
        .from('player_profiles')
        .select('id, full_name, rut, date_of_birth, photo_url, profile_photo, position, estado_verificacion, foto_bloqueada, qr_token, fecha_primer_partido')
        .eq('qr_token', rawToken)
        .single();

      if (fetchError || !data) { setError('Jugador no encontrado. Verifica el código QR.'); return; }
      await buildAndSetPlayer(data);
    } catch {
      setError('Error al buscar jugador. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  // ─── BÚSQUEDA POR RUT ─────────────────────────────────────
  const searchByRut = async (rut: string) => {
    if (!rut.trim()) { setError('Ingresa un RUT válido'); return; }
    setLoading(true);
    setError('');
    setPlayerData(null);
    setValidationResult(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('player_profiles')
        .select('id, full_name, rut, date_of_birth, photo_url, profile_photo, position, estado_verificacion, foto_bloqueada, qr_token, fecha_primer_partido')
        .ilike('rut', `%${rut.replace(/\./g, '').replace(/-/g, '').trim()}%`)
        .single();

      if (fetchError || !data) { setError('Jugador no encontrado con ese RUT.'); return; }
      await buildAndSetPlayer(data);
    } catch {
      setError('Error al buscar jugador. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  // ─── OCR CÉDULA ───────────────────────────────────────────
  const startCedulaCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScanning(true);
    } catch {
      setError('No se pudo acceder a la cámara. Verifica los permisos.');
    }
  };

  const stopCedulaCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const captureAndOcr = async () => {
    if (!videoRef.current) return;
    setOcrLoading(true);
    setOcrStatus('Capturando imagen...');
    setError('');

    try {
      // Capturar frame del video
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(videoRef.current, 0, 0);

      stopCedulaCamera();

      setOcrStatus('Cargando motor OCR...');
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('spa', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setOcrStatus(`Leyendo cédula... ${Math.round((m.progress || 0) * 100)}%`);
          }
        }
      });

      setOcrStatus('Analizando cédula...');
      const { data: { text } } = await worker.recognize(canvas);
      await worker.terminate();

      // Extraer RUT del texto (formato: 12.345.678-9 o 12345678-9)
      const rutRegex = /\b(\d{1,2}[\.\s]?\d{3}[\.\s]?\d{3}[\s\-]?[\dkK])\b/g;
      const matches = text.match(rutRegex);

      if (matches && matches.length > 0) {
        // Limpiar y usar el primer RUT encontrado
        const rutFound = matches[0].replace(/[\.\s]/g, '').toUpperCase();
        setOcrStatus(`RUT detectado: ${rutFound}`);
        setRutSearch(rutFound);
        setTimeout(() => {
          setOcrStatus('');
          searchByRut(rutFound);
        }, 1000);
      } else {
        // No encontró RUT automáticamente — mostrar texto para revisión manual
        setOcrStatus('');
        setError('No se detectó RUT automáticamente. Intenta de nuevo o ingrésalo manualmente.');
      }
    } catch (err) {
      console.error('OCR error:', err);
      setOcrStatus('');
      setError('Error al procesar la imagen. Intenta de nuevo.');
    } finally {
      setOcrLoading(false);
    }
  };

  // ─── HELPERS ──────────────────────────────────────────────
  const buildAndSetPlayer = async (data: any) => {
    const { data: teamData } = await supabase
      .from('base_team_players')
      .select('base_teams(name, logo_url)')
      .eq('player_id', data.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const photoUrl = data.profile_photo
      ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/player-photos/${data.profile_photo}`
      : data.photo_url || null;

    setPlayerData({
      ...data,
      photo_url: photoUrl,
      team_name: teamData?.base_teams?.name || 'Sin equipo',
      team_logo: teamData?.base_teams?.logo_url,
    });
  };

  const handleValidation = async (result: ValidationResult) => {
    if (!playerData || !profile) return;
    setSubmitting(true);
    try {
      await supabase.from('player_validation_logs').insert({
        player_id: playerData.id,
        validated_by: profile.id,
        validation_result: result,
        notas: notes.trim() || null,
      });
      setValidationResult(result);
    } catch {
      setError('Error al guardar la validación. Intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verificado': return (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl font-bold">
          <CheckCircle2 className="h-5 w-5" /><span>Verificado</span>
        </div>
      );
      case 'rechazado': return (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl font-bold">
          <XCircle className="h-5 w-5" /><span>Rechazado</span>
        </div>
      );
      default: return (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-xl font-bold">
          <Clock className="h-5 w-5" /><span>Pendiente</span>
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
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="text-center">
          <div className="inline-block p-4 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl mb-4">
            <Shield className="h-12 w-12 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-2">Validación en Cancha</h1>
          <p className="text-gray-600 font-medium">Verifica la identidad del jugador antes del partido</p>
        </div>

        {/* ── SELECTOR DE MODO ── */}
        {mode === 'select' && !playerData && !validationResult && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setMode('qr')}
              className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-xl border-2 border-gray-100 hover:border-blue-400 hover:shadow-2xl transition-all group"
            >
              <div className="p-4 bg-blue-100 rounded-2xl group-hover:bg-blue-500 transition-colors">
                <QrCode className="h-12 w-12 text-blue-600 group-hover:text-white transition-colors" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-black text-gray-900 mb-1">Carnet Digital</h3>
                <p className="text-sm text-gray-500">Escanea el QR del carnet digital Mediogol del jugador</p>
              </div>
            </button>

            <button
              onClick={() => setMode('cedula')}
              className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-xl border-2 border-gray-100 hover:border-emerald-400 hover:shadow-2xl transition-all group"
            >
              <div className="p-4 bg-emerald-100 rounded-2xl group-hover:bg-emerald-500 transition-colors">
                <CreditCard className="h-12 w-12 text-emerald-600 group-hover:text-white transition-colors" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-black text-gray-900 mb-1">Cédula de Identidad</h3>
                <p className="text-sm text-gray-500">Lee la cédula física con la cámara o ingresa el RUT manualmente</p>
              </div>
            </button>
          </div>
        )}

        {/* ── MODO QR ── */}
        {mode === 'qr' && !playerData && !validationResult && (
          <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-gray-100 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={resetAll} className="text-gray-400 hover:text-gray-600 text-sm font-medium">← Volver</button>
              <h2 className="text-lg font-black text-gray-900">Escanear QR Mediogol</h2>
            </div>

            {!scanning && !loading && (
              <button
                onClick={startQrScanner}
                className="w-full flex items-center justify-center gap-3 py-5 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-2xl hover:from-blue-600 hover:to-blue-800 transition-all font-bold text-lg shadow-lg"
              >
                <Camera className="h-7 w-7" />
                Abrir Cámara y Escanear
              </button>
            )}

            {loading && (
              <div className="w-full flex items-center justify-center gap-3 py-5 bg-blue-50 rounded-2xl border-2 border-blue-200">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                <span className="font-bold text-blue-700">Buscando jugador...</span>
              </div>
            )}

            {scanning && (
              <div className="space-y-3">
                <div id="qr-reader" className="w-full rounded-2xl overflow-hidden" />
                <button onClick={stopQrScanner} className="w-full flex items-center justify-center gap-2 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-bold">
                  <CameraOff className="h-5 w-5" />Cancelar
                </button>
              </div>
            )}

            {!scanning && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">O ingresa el código manualmente</p>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={qrToken}
                      onChange={(e) => setQrToken(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && searchByQr(qrToken)}
                      placeholder="MG-xxxxxxxxxxxxxxxx"
                      className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                    />
                  </div>
                  <button
                    onClick={() => searchByQr(qrToken)}
                    disabled={loading}
                    className="px-6 py-4 bg-gray-800 text-white rounded-xl hover:bg-gray-900 font-bold shadow disabled:opacity-50"
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
        )}

        {/* ── MODO CÉDULA ── */}
        {mode === 'cedula' && !playerData && !validationResult && (
          <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-gray-100 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={resetAll} className="text-gray-400 hover:text-gray-600 text-sm font-medium">← Volver</button>
              <h2 className="text-lg font-black text-gray-900">Leer Cédula de Identidad</h2>
            </div>

            {/* Cámara para OCR */}
            {!scanning && !ocrLoading && !loading && (
              <button
                onClick={startCedulaCamera}
                className="w-full flex items-center justify-center gap-3 py-5 bg-gradient-to-r from-emerald-500 to-emerald-700 text-white rounded-2xl hover:from-emerald-600 hover:to-emerald-800 transition-all font-bold text-lg shadow-lg"
              >
                <ScanLine className="h-7 w-7" />
                Escanear Cédula con Cámara
              </button>
            )}

            {scanning && (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full rounded-2xl"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="border-4 border-emerald-400 rounded-xl w-4/5 h-1/2 opacity-70" />
                  </div>
                  <p className="absolute bottom-3 left-0 right-0 text-center text-white text-sm font-bold bg-black/40 py-1">
                    Centra la cédula dentro del recuadro
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={captureAndOcr}
                    className="flex-1 flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold shadow-lg text-lg"
                  >
                    <Camera className="h-6 w-6" />
                    Capturar y Leer
                  </button>
                  <button
                    onClick={stopCedulaCamera}
                    className="px-5 py-4 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-bold"
                  >
                    <CameraOff className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {(ocrLoading || loading) && (
              <div className="w-full flex items-center justify-center gap-3 py-5 bg-emerald-50 rounded-2xl border-2 border-emerald-200">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
                <span className="font-bold text-emerald-700">{ocrStatus || 'Procesando...'}</span>
              </div>
            )}

            {/* Búsqueda manual por RUT */}
            {!scanning && !ocrLoading && !loading && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">O ingresa el RUT manualmente</p>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={rutSearch}
                      onChange={(e) => setRutSearch(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && searchByRut(rutSearch)}
                      placeholder="12345678-9"
                      className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium"
                    />
                  </div>
                  <button
                    onClick={() => searchByRut(rutSearch)}
                    disabled={loading}
                    className="px-6 py-4 bg-gray-800 text-white rounded-xl hover:bg-gray-900 font-bold shadow disabled:opacity-50"
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
        )}

        {/* ── RESULTADO JUGADOR ENCONTRADO ── */}
        {playerData && !validationResult && (
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl p-8 border-4 border-blue-500">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-shrink-0">
                {playerData.photo_url ? (
                  <img src={playerData.photo_url} alt={playerData.full_name}
                    className="w-40 h-40 md:w-48 md:h-48 object-cover rounded-2xl border-4 border-blue-500 shadow-2xl" />
                ) : (
                  <div className="w-40 h-40 md:w-48 md:h-48 bg-gray-700 rounded-2xl flex items-center justify-center border-4 border-blue-500">
                    <User className="h-20 w-20 text-gray-500" />
                  </div>
                )}
              </div>

              <div className="flex-1 text-white space-y-4">
                <div>
                  <p className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">Nombre Completo</p>
                  <h2 className="text-3xl font-black">{playerData.full_name}</h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">Equipo</p>
                    <div className="flex items-center gap-2">
                      {playerData.team_logo && <img src={playerData.team_logo} alt="" className="w-6 h-6 rounded" />}
                      <p className="font-bold">{playerData.team_name}</p>
                    </div>
                  </div>
                  {playerData.rut && (
                    <div>
                      <p className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">RUT</p>
                      <p className="font-bold">{playerData.rut}</p>
                    </div>
                  )}
                  {playerData.position && (
                    <div>
                      <p className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">Posición</p>
                      <p className="font-bold">{playerData.position}</p>
                    </div>
                  )}
                  {playerData.date_of_birth && (
                    <div>
                      <p className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">Nacimiento</p>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-blue-400" />
                        <p className="font-bold">{new Date(playerData.date_of_birth).toLocaleDateString('es-ES')}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-2">Estado</p>
                  {getStatusBadge(playerData.estado_verificacion)}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t-2 border-gray-700 space-y-4">
              <div className="bg-yellow-500/20 border-2 border-yellow-500 rounded-xl p-4 flex items-start gap-3">
                <Camera className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-300 font-medium">
                  Compara visualmente la foto con el rostro del jugador antes de validar.
                </p>
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas opcionales sobre la validación..."
                rows={2}
                className="w-full px-4 py-3 bg-gray-800 border-2 border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
              />

              <div className="flex flex-col md:flex-row gap-3">
                <button onClick={() => handleValidation('aprobado')} disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-green-500 text-white rounded-xl hover:bg-green-600 font-bold shadow-lg disabled:opacity-50">
                  <CheckCircle2 className="h-5 w-5" />Jugador Válido
                </button>
                <button onClick={() => handleValidation('sospechoso')} disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-yellow-500 text-white rounded-xl hover:bg-yellow-600 font-bold shadow-lg disabled:opacity-50">
                  <AlertTriangle className="h-5 w-5" />Sospechoso
                </button>
                <button onClick={() => handleValidation('rechazado')} disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-red-500 text-white rounded-xl hover:bg-red-600 font-bold shadow-lg disabled:opacity-50">
                  <XCircle className="h-5 w-5" />Rechazar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── RESULTADO VALIDACIÓN ── */}
        {validationResult && (
          <div className={`rounded-2xl shadow-2xl p-8 border-4 text-center ${
            validationResult === 'aprobado' ? 'bg-green-50 border-green-500' :
            validationResult === 'sospechoso' ? 'bg-yellow-50 border-yellow-500' :
            'bg-red-50 border-red-500'}`}>
            {validationResult === 'aprobado' && (
              <><CheckCircle2 className="h-20 w-20 text-green-600 mx-auto mb-4" />
              <h3 className="text-3xl font-black text-gray-900 mb-2">¡Jugador Válido!</h3>
              <p className="text-gray-700 font-medium">{playerData?.full_name} puede jugar.</p></>
            )}
            {validationResult === 'sospechoso' && (
              <><AlertTriangle className="h-20 w-20 text-yellow-600 mx-auto mb-4" />
              <h3 className="text-3xl font-black text-gray-900 mb-2">Requiere Revisión</h3>
              <p className="text-gray-700 font-medium">La validación de {playerData?.full_name} requiere revisión.</p></>
            )}
            {validationResult === 'rechazado' && (
              <><XCircle className="h-20 w-20 text-red-600 mx-auto mb-4" />
              <h3 className="text-3xl font-black text-gray-900 mb-2">Jugador Rechazado</h3>
              <p className="text-gray-700 font-medium">{playerData?.full_name} no puede jugar.</p></>
            )}
            <button onClick={resetAll}
              className="mt-6 px-8 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 font-bold shadow-lg">
              Validar Otro Jugador
            </button>
          </div>
        )}

      </div>
    </Layout>
  );
};
