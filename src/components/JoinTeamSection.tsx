import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, Users, Plus, ChevronRight, CheckCircle, Clock,
  XCircle, ArrowLeft, Loader2, UserCheck, Shield, AlertCircle
} from 'lucide-react';

interface BaseTeamResult {
  id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  founded_date: string | null;
  owner: { full_name: string; avatar_url: string | null } | null;
  member_count: number;
  my_request_status: 'none' | 'pending' | 'approved' | 'rejected';
  am_member: boolean;
}

interface JoinTeamSectionProps {
  onCreateTeam: () => void;
  onJoinedTeam: () => void;
}

export function JoinTeamSection({ onCreateTeam, onJoinedTeam }: JoinTeamSectionProps) {
  const { profile } = useAuth();
  const [step, setStep] = useState<'choose' | 'search' | 'success'>('choose');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BaseTeamResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);
  const [cancellingRequest, setCancellingRequest] = useState<string | null>(null);
  const [successTeam, setSuccessTeam] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 'search') return;
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) {
        searchTeams(query.trim());
      } else {
        setResults([]);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, step]);

  const searchTeams = async (q: string) => {
    if (!profile) return;
    setSearching(true);
    setError(null);

    try {
      // Buscar equipos por nombre (excluir los propios)
      const { data: teamsData, error: teamsError } = await supabase
        .from('base_teams')
        .select('id, name, logo_url, description, founded_date, owner_id')
        .ilike('name', `%${q}%`)
        .neq('owner_id', profile.id)
        .limit(10);

      if (teamsError) throw teamsError;
      if (!teamsData || teamsData.length === 0) {
        setResults([]);
        return;
      }

      const teamIds = teamsData.map((t) => t.id);
      const ownerIds = [...new Set(teamsData.map((t) => t.owner_id))];

      // Traer datos de dueños
      const { data: ownersData } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', ownerIds);

      // Traer mis solicitudes a estos equipos
      const { data: myRequests } = await supabase
        .from('base_team_join_requests')
        .select('base_team_id, status')
        .eq('requester_id', profile.id)
        .in('base_team_id', teamIds);

      // Verificar si ya soy miembro
      const { data: myMemberships } = await supabase
        .from('base_team_players')
        .select('base_team_id')
        .eq('player_id', profile.id)
        .eq('status', 'active')
        .in('base_team_id', teamIds);

      // Contar miembros por equipo
      const { data: memberCounts } = await supabase
        .from('base_team_players')
        .select('base_team_id')
        .in('base_team_id', teamIds)
        .eq('status', 'active');

      const countMap: Record<string, number> = {};
      memberCounts?.forEach((m) => {
        countMap[m.base_team_id] = (countMap[m.base_team_id] || 0) + 1;
      });

      const requestMap: Record<string, string> = {};
      myRequests?.forEach((r) => {
        requestMap[r.base_team_id] = r.status;
      });

      const memberSet = new Set(myMemberships?.map((m) => m.base_team_id) || []);
      const ownerMap: Record<string, any> = {};
      ownersData?.forEach((o) => { ownerMap[o.id] = o; });

      const enriched: BaseTeamResult[] = teamsData.map((t) => ({
        id: t.id,
        name: t.name,
        logo_url: t.logo_url,
        description: t.description,
        founded_date: t.founded_date,
        owner: ownerMap[t.owner_id] || null,
        member_count: countMap[t.id] || 0,
        my_request_status: (requestMap[t.id] as any) || 'none',
        am_member: memberSet.has(t.id),
      }));

      setResults(enriched);
    } catch (err: any) {
      setError(err.message || 'Error al buscar equipos');
    } finally {
      setSearching(false);
    }
  };

  const sendJoinRequest = async (team: BaseTeamResult) => {
    if (!profile) return;
    setSendingRequest(team.id);
    setError(null);

    try {
      // 1. Crear la solicitud de ingreso
      const { error: insertError } = await supabase
        .from('base_team_join_requests')
        .insert({
          base_team_id: team.id,
          requester_id: profile.id,
          message: null,
        });

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error('Ya enviaste una solicitud a este equipo');
        }
        throw insertError;
      }

      // 2. Obtener el owner_id del equipo para enviarle un mensaje de notificación
      const { data: teamData } = await supabase
        .from('base_teams')
        .select('owner_id')
        .eq('id', team.id)
        .maybeSingle();

      if (teamData?.owner_id) {
        // Insertar mensaje de notificación al dueño del equipo
        await supabase.from('messages').insert({
          from_user_id: profile.id,
          to_user_id: teamData.owner_id,
          subject: `Solicitud de ingreso al equipo ${team.name}`,
          content: `${profile.full_name} quiere unirse a tu equipo "${team.name}". Puedes aprobar o rechazar la solicitud desde "Mis Equipos" → sección de jugadores de tu equipo.`,
          is_read: false,
        });
      }

      setSuccessTeam(team.name);
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Error al enviar la solicitud');
    } finally {
      setSendingRequest(null);
    }
  };

  const cancelJoinRequest = async (team: BaseTeamResult) => {
    if (!profile) return;
    setCancellingRequest(team.id);
    setError(null);
    try {
      const { error: delError } = await supabase
        .from('base_team_join_requests')
        .delete()
        .eq('base_team_id', team.id)
        .eq('requester_id', profile.id)
        .eq('status', 'pending');

      if (delError) throw delError;

      // Actualizar estado local sin refetch
      setResults((prev) =>
        prev.map((r) =>
          r.id === team.id ? { ...r, my_request_status: 'none' } : r
        )
      );
    } catch (err: any) {
      setError(err.message || 'Error al cancelar la solicitud');
    } finally {
      setCancellingRequest(null);
    }
  };

  // PASO 1 — Elegir
  if (step === 'choose') {
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Bienvenido a Mis Equipos!</h2>
          <p className="text-gray-600 max-w-md mx-auto">
            Para comenzar, cuéntanos cómo quieres participar en la plataforma.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {/* Opción A: Buscar equipo */}
          <button
            onClick={() => setStep('search')}
            className="group flex flex-col items-center text-center p-6 bg-white rounded-xl border-2 border-transparent hover:border-emerald-400 hover:shadow-md transition-all duration-200"
          >
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
              <Search className="h-7 w-7 text-blue-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Ya pertenezco a un equipo</h3>
            <p className="text-sm text-gray-500 mb-4">
              Busca tu equipo por nombre y envía una solicitud para unirte. El capitán debe aprobarte.
            </p>
            <span className="flex items-center gap-1 text-sm font-semibold text-blue-600">
              Buscar mi equipo <ChevronRight className="h-4 w-4" />
            </span>
          </button>

          {/* Opción B: Crear equipo */}
          <button
            onClick={onCreateTeam}
            className="group flex flex-col items-center text-center p-6 bg-white rounded-xl border-2 border-transparent hover:border-emerald-400 hover:shadow-md transition-all duration-200"
          >
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-emerald-200 transition-colors">
              <Plus className="h-7 w-7 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Quiero crear mi equipo</h3>
            <p className="text-sm text-gray-500 mb-4">
              Soy el dueño o fundador. Creo el equipo, gestiono jugadores y los inscribo en campeonatos.
            </p>
            <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
              Crear equipo <ChevronRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      </div>
    );
  }

  // PASO 3 — Éxito
  if (step === 'success') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="h-9 w-9 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Solicitud enviada!</h2>
        <p className="text-gray-600 mb-6">
          Tu solicitud para unirte a <strong>{successTeam}</strong> fue enviada al capitán del equipo.
          Recibirás una notificación cuando sea aprobada.
        </p>
        <div className="bg-white rounded-xl border border-green-200 p-4 mb-6 max-w-sm mx-auto">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm text-gray-700">
              Mientras esperas, puedes explorar campeonatos o buscar otro equipo.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => { setStep('search'); setQuery(''); setResults([]); }}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            Buscar otro equipo
          </button>
          <button
            onClick={onCreateTeam}
            className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors"
          >
            Crear mi propio equipo
          </button>
        </div>
      </div>
    );
  }

  // PASO 2 — Buscar
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setStep('choose'); setQuery(''); setResults([]); setError(null); }}
            className="text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white">Buscar mi equipo</h2>
            <p className="text-blue-100 text-sm">Escribe el nombre del equipo para buscarlo</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Buscador */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej: Los Cóndores, Deportivo Chile..."
            autoFocus
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />
          )}
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Estado vacío */}
        {query.length < 2 && (
          <div className="text-center py-10 text-gray-400">
            <Search className="h-12 w-12 opacity-20 mx-auto mb-3" />
            <p className="text-sm">Escribe al menos 2 caracteres para buscar</p>
          </div>
        )}

        {/* Sin resultados */}
        {!searching && query.length >= 2 && results.length === 0 && (
          <div className="text-center py-10">
            <Users className="h-12 w-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium mb-1">No se encontraron equipos con ese nombre</p>
            <p className="text-gray-400 text-sm mb-6">
              Verifica el nombre o crea tu propio equipo.
            </p>
            <button
              onClick={onCreateTeam}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm transition-colors"
            >
              <Plus className="h-4 w-4" />
              Crear mi equipo
            </button>
          </div>
        )}

        {/* Resultados */}
        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((team) => (
              <div
                key={team.id}
                className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-4">
                  {/* Logo */}
                  {team.logo_url ? (
                    <img
                      src={team.logo_url}
                      alt={team.name}
                      className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Users className="h-7 w-7 text-white" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 text-base">{team.name}</h3>
                    {team.owner && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Capitán: {team.owner.full_name}
                      </p>
                    )}
                    {team.description && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{team.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {team.member_count} jugador{team.member_count !== 1 ? 'es' : ''}
                      </span>
                      {team.founded_date && (
                        <span className="text-xs text-gray-400">
                          Fundado: {new Date(team.founded_date).getFullYear()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Acción */}
                  <div className="flex-shrink-0">
                    {team.am_member ? (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-semibold">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Ya eres miembro
                      </span>
                    ) : team.my_request_status === 'pending' ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold">
                          <Clock className="h-3.5 w-3.5" />
                          Solicitud enviada
                        </span>
                        <button
                          onClick={() => cancelJoinRequest(team)}
                          disabled={cancellingRequest === team.id}
                          className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
                        >
                          {cancellingRequest === team.id ? 'Cancelando...' : 'Cancelar solicitud'}
                        </button>
                      </div>
                    ) : team.my_request_status === 'approved' ? (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-semibold">
                        <UserCheck className="h-3.5 w-3.5" />
                        Aprobado
                      </span>
                    ) : team.my_request_status === 'rejected' ? (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-semibold">
                        <XCircle className="h-3.5 w-3.5" />
                        Rechazada
                      </span>
                    ) : (
                      <button
                        onClick={() => sendJoinRequest(team)}
                        disabled={sendingRequest === team.id}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {sendingRequest === team.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserCheck className="h-3.5 w-3.5" />
                        )}
                        Solicitar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
