import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Search, Users as UsersIcon, Plus, Mail } from 'lucide-react';
import { Championship, Profile, BaseTeam } from '../types/database';

interface CreateTeamModalProps {
  championship: Championship;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateTeamModal = ({ championship, onClose, onSuccess }: CreateTeamModalProps) => {
  const { profile } = useAuth();
  const [baseTeams, setBaseTeams] = useState<BaseTeam[]>([]);
  const [selectedBaseTeam, setSelectedBaseTeam] = useState<BaseTeam | null>(null);
  const [teamSearchTerm, setTeamSearchTerm] = useState('');
  const [teamSearchResults, setTeamSearchResults] = useState<BaseTeam[]>([]);
  const [showTeamResults, setShowTeamResults] = useState(false);
  const [isSearchingTeams, setIsSearchingTeams] = useState(false);

  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTeamName, setInviteTeamName] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const searchTeams = async () => {
      if (teamSearchTerm.length < 2) {
        setTeamSearchResults([]);
        return;
      }

      setIsSearchingTeams(true);
      try {
        const { data: existingTeams } = await supabase
          .from('team_registrations')
          .select('base_team_id')
          .eq('championship_id', championship.id);

        const excludeIds = existingTeams?.map(t => t.base_team_id) || [];

        let query = supabase
          .from('base_teams')
          .select('*, owner:profiles(full_name)')
          .eq('status', 'active')
          .ilike('name', `%${teamSearchTerm}%`)
          .order('created_at', { ascending: false })
          .limit(10);

        if (excludeIds.length > 0) {
          query = query.not('id', 'in', `(${excludeIds.join(',')})`);
        }

        const { data } = await query;
        if (data) setTeamSearchResults(data);
      } catch (err) {
        console.error('Error searching teams:', err);
      } finally {
        setIsSearchingTeams(false);
      }
    };

    const timeoutId = setTimeout(searchTeams, 300);
    return () => clearTimeout(timeoutId);
  }, [teamSearchTerm, championship.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.team-search-container')) {
        setShowTeamResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteEmail || !inviteTeamName) {
      setError('El correo y el nombre del equipo son requeridos');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data: invitationData, error: invitationError } = await supabase
        .from('team_invitations')
        .insert({
          championship_id: championship.id,
          invited_by: profile?.id,
          email: inviteEmail,
          team_name: inviteTeamName,
          message: inviteMessage || '',
          status: 'pending',
        })
        .select()
        .single();

      if (invitationError) throw invitationError;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-team-invitation`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: inviteEmail,
          teamName: inviteTeamName,
          championshipName: championship.name,
          championshipId: championship.id,
          message: inviteMessage,
          invitationToken: invitationData.token,
        }),
      });

      if (!response.ok) {
        throw new Error('Error al enviar el correo de invitación');
      }

      setSuccessMessage(`Invitación enviada exitosamente a ${inviteEmail}`);
      setInviteEmail('');
      setInviteTeamName('');
      setInviteMessage('');
      setTimeout(() => {
        setShowInviteForm(false);
        setSuccessMessage(null);
        onSuccess();
      }, 2000);
    } catch (err: any) {
      console.error('Error sending invitation:', err);
      setError(err.message || 'Error al enviar la invitación');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBaseTeam) {
      setError('Debes seleccionar un equipo');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const captainId = selectedBaseTeam.owner_id;

      const { error: regError } = await supabase
        .from('team_registrations')
        .insert({
          base_team_id: selectedBaseTeam.id,
          championship_id: championship.id,
          captain_id: captainId,
          status: 'pending',
          stamina: 100,
          comments: comments || null,
        });

      if (regError) throw regError;

      const { error: teamError } = await supabase
        .from('teams')
        .insert({
          championship_id: championship.id,
          base_team_id: selectedBaseTeam.id,
          name: selectedBaseTeam.name,
          logo_url: selectedBaseTeam.logo_url || null,
          captain_id: captainId,
          comments: comments || null,
          stamina: 100,
          captain_confirmed: false,
          is_enabled: false,
        });

      if (teamError) throw teamError;

      alert(`El equipo ${selectedBaseTeam.name} ha sido registrado. Se ha enviado una notificación al capitán para que confirme su participación.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error registering team:', err);
      setError(err.message || 'Error al registrar el equipo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="border-b px-6 py-4 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-2xl font-bold text-gray-900">Registrar Equipo en Campeonato</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {!showInviteForm ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Seleccionar Equipo *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowInviteForm(true)}
                    className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    Invitar Equipo
                  </button>
                </div>

                {selectedBaseTeam ? (
                  <div className="p-4 border-2 border-emerald-600 bg-emerald-50 rounded-lg mb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {selectedBaseTeam.logo_url ? (
                          <img
                            src={selectedBaseTeam.logo_url}
                            alt={selectedBaseTeam.name}
                            className="w-12 h-12 rounded object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded flex items-center justify-center">
                            <UsersIcon size={24} className="text-white" />
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold text-gray-900">{selectedBaseTeam.name}</h3>
                          <p className="text-sm text-gray-600">
                            Propietario: {selectedBaseTeam.owner?.full_name}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBaseTeam(null);
                          setTeamSearchTerm('');
                        }}
                        className="text-gray-500 hover:text-red-600 transition-colors"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative team-search-container">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Buscar equipo por nombre (mín. 2 caracteres)..."
                      value={teamSearchTerm}
                      onChange={(e) => {
                        setTeamSearchTerm(e.target.value);
                        setShowTeamResults(true);
                      }}
                      onFocus={() => setShowTeamResults(true)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />

                    {showTeamResults && teamSearchTerm.length >= 2 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                        {isSearchingTeams ? (
                          <div className="p-4 text-center text-gray-500">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600 mx-auto"></div>
                          </div>
                        ) : teamSearchResults.length === 0 ? (
                          <div className="p-4 text-center text-gray-500">
                            No se encontraron equipos
                          </div>
                        ) : (
                          teamSearchResults.map((team) => (
                            <button
                              key={team.id}
                              type="button"
                              onClick={() => {
                                setSelectedBaseTeam(team);
                                setTeamSearchTerm('');
                                setShowTeamResults(false);
                              }}
                              className="w-full p-3 text-left hover:bg-gray-50 transition-colors border-b last:border-b-0"
                            >
                              <div className="flex items-center gap-3">
                                {team.logo_url ? (
                                  <img
                                    src={team.logo_url}
                                    alt={team.name}
                                    className="w-10 h-10 rounded object-cover"
                                  />
                                ) : (
                                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded flex items-center justify-center">
                                    <UsersIcon size={20} className="text-white" />
                                  </div>
                                )}
                                <div>
                                  <h4 className="font-semibold text-gray-900">{team.name}</h4>
                                  <p className="text-xs text-gray-600">
                                    Propietario: {team.owner?.full_name}
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    {teamSearchTerm.length > 0 && teamSearchTerm.length < 2 && (
                      <p className="text-sm text-gray-500 mt-1">
                        Escribe al menos 2 caracteres para buscar
                      </p>
                    )}
                  </div>
                )}
              </div>

              {selectedBaseTeam && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-1">Capitán del Equipo</h3>
                  <p className="text-sm text-blue-800">
                    El propietario del equipo ({selectedBaseTeam.owner?.full_name}) será asignado automáticamente como capitán y recibirá una notificación para confirmar su participación en el campeonato.
                  </p>
                </div>
              )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Comentarios
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                placeholder="Información adicional sobre el equipo..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || selectedBaseTeam === null}
                  className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Procesando...' : 'Registrar Equipo'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSendInvitation} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-blue-900 mb-2">Invitar Equipo por Correo</h3>
                <p className="text-sm text-blue-800">
                  Envía una invitación a un usuario para que registre su equipo en este campeonato.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Equipo Sugerido *
                </label>
                <input
                  type="text"
                  value={inviteTeamName}
                  onChange={(e) => setInviteTeamName(e.target.value)}
                  placeholder="Nombre del equipo"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mensaje Opcional
                </label>
                <textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  rows={3}
                  placeholder="Mensaje personalizado para el invitado..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {successMessage && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-700">{successMessage}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteForm(false);
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    'Enviando...'
                  ) : (
                    <>
                      <Mail className="h-4 w-4" />
                      Enviar Invitación
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
