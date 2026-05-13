import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { PlayerCredential } from '../types/database';
import { Shield, User, Calendar, Trophy, QrCode, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import QRCode from 'react-qr-code';

export const PlayerCredentialPage = () => {
  const { profile } = useAuth();
  const [credential, setCredential] = useState<PlayerCredential | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchCredential();
    }
  }, [profile]);

  const fetchCredential = async () => {
    try {
      const { data, error } = await supabase
        .from('player_profiles')
        .select(`
          id,
          full_name,
          rut,
          date_of_birth,
          photo_url,
          profile_photo,
          position,
          estado_verificacion,
          foto_bloqueada,
          qr_token,
          fecha_primer_partido
        `)
        .eq('id', profile?.id)
        .single();

      if (error) throw error;

      const { data: teamData } = await supabase
        .from('base_team_players')
        .select('base_teams(name, logo_url)')
        .eq('player_id', profile?.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Construir URL de foto: priorizar profile_photo (Storage) sobre photo_url (URL externa)
      const photoUrl = data.profile_photo
        ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/player-photos/${data.profile_photo}`
        : data.photo_url || null;

      const credentialData: PlayerCredential = {
        ...data,
        photo_url: photoUrl,
        team_name: teamData?.base_teams?.name || 'Sin equipo',
        team_logo: teamData?.base_teams?.logo_url,
      };

      setCredential(credentialData);
    } catch (error) {
      console.error('Error fetching credential:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verificado':
        return (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl font-bold shadow-lg">
            <CheckCircle2 className="h-5 w-5" />
            <span>Verificado</span>
          </div>
        );
      case 'rechazado':
        return (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl font-bold shadow-lg">
            <XCircle className="h-5 w-5" />
            <span>Rechazado</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-xl font-bold shadow-lg">
            <Clock className="h-5 w-5" />
            <span>Pendiente</span>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        </div>
      </Layout>
    );
  }

  if (!credential) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-2xl font-black text-gray-900 mb-2">Credencial no disponible</h2>
            <p className="text-gray-600">No se pudo cargar tu credencial digital.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-3">Credencial Digital</h1>
          <p className="text-gray-600 text-lg font-medium">Tu identificación oficial en Mediogol</p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-900 rounded-3xl transform rotate-1"></div>

          <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-3xl shadow-2xl p-8 md:p-12 border-4 border-emerald-500">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 via-green-500 to-emerald-600"></div>

            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-shrink-0">
                {credential.photo_url ? (
                  <div className="relative">
                    <img
                      src={credential.photo_url}
                      alt={credential.full_name}
                      className="w-48 h-48 md:w-56 md:h-56 object-cover rounded-2xl border-4 border-emerald-500 shadow-2xl"
                    />
                    {credential.foto_bloqueada && (
                      <div className="absolute top-2 right-2 p-2 bg-red-500 rounded-full shadow-lg">
                        <Shield className="h-5 w-5 text-white" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-48 h-48 md:w-56 md:h-56 bg-gray-700 rounded-2xl flex items-center justify-center border-4 border-emerald-500">
                    <User className="h-24 w-24 text-gray-500" />
                  </div>
                )}
              </div>

              <div className="flex-1 text-white space-y-6">
                <div>
                  <p className="text-emerald-400 text-sm font-bold uppercase tracking-wider mb-2">Nombre Completo</p>
                  <h2 className="text-3xl md:text-4xl font-black">{credential.full_name}</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-emerald-400 text-sm font-bold uppercase tracking-wider mb-2">Equipo</p>
                    <div className="flex items-center gap-3">
                      {credential.team_logo && (
                        <img src={credential.team_logo} alt="" className="w-8 h-8 rounded-lg" />
                      )}
                      <p className="text-xl font-bold">{credential.team_name}</p>
                    </div>
                  </div>

                  {credential.position && (
                    <div>
                      <p className="text-emerald-400 text-sm font-bold uppercase tracking-wider mb-2">Posición</p>
                      <p className="text-xl font-bold">{credential.position}</p>
                    </div>
                  )}

                  {credential.rut && (
                    <div>
                      <p className="text-emerald-400 text-sm font-bold uppercase tracking-wider mb-2">RUT/DNI</p>
                      <p className="text-xl font-bold">{credential.rut}</p>
                    </div>
                  )}

                  {credential.date_of_birth && (
                    <div>
                      <p className="text-emerald-400 text-sm font-bold uppercase tracking-wider mb-2">Fecha de Nacimiento</p>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-emerald-400" />
                        <p className="text-xl font-bold">
                          {new Date(credential.date_of_birth).toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-emerald-400 text-sm font-bold uppercase tracking-wider mb-3">Estado de Verificación</p>
                  {getStatusBadge(credential.estado_verificacion)}
                </div>

                {credential.fecha_primer_partido && (
                  <div className="p-4 bg-yellow-500/20 border-2 border-yellow-500 rounded-xl">
                    <div className="flex items-start gap-3">
                      <Trophy className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-bold text-yellow-400 mb-1">Jugador Activo</p>
                        <p className="text-sm text-gray-300">
                          Primer partido: {new Date(credential.fecha_primer_partido).toLocaleDateString('es-ES')}
                        </p>
                        {credential.foto_bloqueada && (
                          <p className="text-sm text-gray-300 mt-1">Foto bloqueada por seguridad</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 pt-8 border-t-2 border-gray-700">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <QrCode className="h-5 w-5 text-emerald-400" />
                    <p className="font-bold text-emerald-400 uppercase tracking-wider">Código QR de Identificación</p>
                  </div>
                  <p className="text-sm text-gray-400">Presenta este código en cancha para validar tu identidad</p>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-2xl">
                  <QRCode
                    value={`https://medio-gol.vercel.app/validate/${credential.qr_token}`}
                    size={200}
                    level="M"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500 font-medium">ID: {credential.qr_token}</p>
            </div>
          </div>
        </div>

        {credential.estado_verificacion === 'pendiente' && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Shield className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 mb-2">Verificación Pendiente</h3>
                <p className="text-gray-700 leading-relaxed">
                  Tu credencial está pendiente de verificación. Un administrador del campeonato revisará
                  y verificará tu identidad antes de que puedas participar en partidos oficiales.
                </p>
              </div>
            </div>
          </div>
        )}

        {credential.foto_bloqueada && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-yellow-100 rounded-xl">
                <Shield className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 mb-2">Foto Bloqueada</h3>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Tu foto ha sido bloqueada por seguridad tras participar en tu primer partido oficial.
                  Esto previene suplantación de identidad.
                </p>
                <p className="text-sm text-gray-600">
                  Si necesitas cambiar tu foto por motivos válidos, contacta a un administrador del campeonato.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
