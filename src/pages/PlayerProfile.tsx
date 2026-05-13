import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { User, Calendar, TrendingUp, Award, MessageSquare, Star, Upload, Send, Shield, CheckCircle2, XCircle, Clock, QrCode } from 'lucide-react';
import { PlayerCard } from '../components/PlayerCard';

interface PlayerProfile {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  position: string | null;
  jersey_number: number | null;
  photo_url: string | null;
  profile_photo: string | null;
  bio: string | null;
  rut?: string;
  estado_verificacion?: string;
  foto_bloqueada?: boolean;
  qr_token?: string;
}

interface PlayerStats {
  matches_played: number;
  total_goals: number;
  total_assists: number;
  total_yellow_cards: number;
  total_red_cards: number;
  total_minutes: number;
  avg_rating: number;
  review_count: number;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: {
    full_name: string;
    avatar_url: string | null;
  };
}

interface TeamHistory {
  team_name: string;
  joined_at: string;
  left_at: string | null;
  is_active: boolean;
}

export const PlayerProfile = () => {
  const pathParts = window.location.pathname.split('/');
  const playerId = pathParts[pathParts.length - 1];
  const { user, profile } = useAuth();
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [teamHistory, setTeamHistory] = useState<TeamHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    if (!playerId) return;
    fetchPlayerData();
  }, [playerId]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen no puede superar los 5MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('player-photos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('player_profiles')
        .update({ profile_photo: fileName })
        .eq('id', user.id);

      if (updateError) throw updateError;

      fetchPlayerData();
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert('Error al subir la foto');
    } finally {
      setUploading(false);
    }
  };

  const fetchPlayerData = async () => {
    try {
      const [profileRes, statsRes, reviewsRes, teamsRes] = await Promise.all([
        supabase
          .from('player_profiles')
          .select('*')
          .eq('id', playerId)
          .maybeSingle(),
        supabase
          .from('player_career_stats')
          .select('*')
          .eq('id', playerId)
          .maybeSingle(),
        supabase
          .from('player_reviews')
          .select('*, reviewer:profiles(full_name, avatar_url)')
          .eq('player_id', playerId)
          .order('created_at', { ascending: false }),
        supabase
          .from('team_players')
          .select('team_id, joined_at, left_at, is_active, teams(name)')
          .eq('player_id', playerId)
          .order('joined_at', { ascending: false }),
      ]);

      if (profileRes.data) setPlayer(profileRes.data);
      if (statsRes.data) setStats(statsRes.data);
      if (reviewsRes.data) setReviews(reviewsRes.data as any);
      if (teamsRes.data) {
        setTeamHistory(
          teamsRes.data.map((t: any) => ({
            team_name: t.teams.name,
            joined_at: t.joined_at,
            left_at: t.left_at,
            is_active: t.is_active,
          }))
        );
      }
    } catch (error) {
      console.error('Error fetching player data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !playerId) return;

    setSubmittingReview(true);
    try {
      const { error } = await supabase.from('player_reviews').insert({
        player_id: playerId,
        reviewer_id: user.id,
        rating: reviewForm.rating,
        comment: reviewForm.comment || null,
      });

      if (error) throw error;

      setShowReviewForm(false);
      setReviewForm({ rating: 5, comment: '' });
      fetchPlayerData();
    } catch (error: any) {
      console.error('Error submitting review:', error);
      alert(error.message || 'Error al enviar la reseña');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !playerId || !messageText.trim()) return;

    setSendingMessage(true);
    try {
      const { data: conversationId, error: funcError } = await supabase.rpc(
        'get_or_create_conversation',
        {
          user1_id: user.id,
          user2_id: playerId,
        }
      );

      if (funcError) throw funcError;

      const { error: msgError } = await supabase
        .from('conversation_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          message: messageText.trim(),
        });

      if (msgError) throw msgError;

      setShowMessageModal(false);
      setMessageText('');
      alert('Mensaje enviado correctamente');
    } catch (error: any) {
      console.error('Error sending message:', error);
      alert('Error al enviar el mensaje');
    } finally {
      setSendingMessage(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <p className="text-center text-gray-600">Cargando...</p>
        </div>
      </Layout>
    );
  }

  if (!player) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <p className="text-center text-gray-600">Jugador no encontrado</p>
        </div>
      </Layout>
    );
  }

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const calculateRating = () => {
    if (!stats) return 75;
    const goalsWeight = Math.min(stats.total_goals * 2, 30);
    const assistsWeight = Math.min(stats.total_assists * 1.5, 20);
    const matchesWeight = Math.min(stats.matches_played * 0.5, 25);
    const reviewWeight = stats.avg_rating * 5;
    return Math.min(Math.round(65 + goalsWeight + assistsWeight + matchesWeight + reviewWeight), 99);
  };

  const calculateStats = () => {
    if (!stats || !player.position) {
      return {
        speed: 70,
        shooting: 70,
        passing: 70,
        dribbling: 70,
        defense: 70,
        physical: 70,
      };
    }

    const pos = player.position.toLowerCase();
    const isGoalkeeper = pos.includes('portero') || pos.includes('arq');
    const isDefender = pos.includes('defensa') || pos.includes('def');
    const isMidfielder = pos.includes('medio') || pos.includes('med');
    const isForward = pos.includes('delantero') || pos.includes('del');

    const experienceBonus = Math.min(stats.matches_played * 0.3, 20);
    const goalsBonus = Math.min(stats.total_goals * 1.5, 25);
    const assistsBonus = Math.min(stats.total_assists * 2, 20);

    let baseStats = {
      speed: 70,
      shooting: 70,
      passing: 70,
      dribbling: 70,
      defense: 70,
      physical: 70,
    };

    if (isGoalkeeper) {
      baseStats = {
        speed: 50 + experienceBonus,
        shooting: 40 + goalsBonus * 0.5,
        passing: 55 + assistsBonus * 0.5,
        dribbling: 45 + experienceBonus * 0.3,
        defense: 70 + experienceBonus,
        physical: 75 + experienceBonus * 0.8,
      };
    } else if (isDefender) {
      baseStats = {
        speed: 65 + experienceBonus * 0.7,
        shooting: 50 + goalsBonus * 0.8,
        passing: 65 + assistsBonus * 0.7,
        dribbling: 60 + experienceBonus * 0.5,
        defense: 75 + experienceBonus,
        physical: 75 + experienceBonus * 0.9,
      };
    } else if (isMidfielder) {
      baseStats = {
        speed: 70 + experienceBonus * 0.8,
        shooting: 65 + goalsBonus,
        passing: 75 + assistsBonus,
        dribbling: 70 + (goalsBonus + assistsBonus) * 0.5,
        defense: 60 + experienceBonus * 0.6,
        physical: 65 + experienceBonus * 0.7,
      };
    } else if (isForward) {
      baseStats = {
        speed: 75 + experienceBonus * 0.9,
        shooting: 75 + goalsBonus * 1.2,
        passing: 65 + assistsBonus * 0.9,
        dribbling: 75 + goalsBonus * 0.8,
        defense: 45 + experienceBonus * 0.3,
        physical: 65 + experienceBonus * 0.7,
      };
    }

    return {
      speed: Math.min(Math.round(baseStats.speed), 99),
      shooting: Math.min(Math.round(baseStats.shooting), 99),
      passing: Math.min(Math.round(baseStats.passing), 99),
      dribbling: Math.min(Math.round(baseStats.dribbling), 99),
      defense: Math.min(Math.round(baseStats.defense), 99),
      physical: Math.min(Math.round(baseStats.physical), 99),
    };
  };

  const playerPhotoUrl = player?.profile_photo
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/player-photos/${player.profile_photo}`
    : undefined;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8 mb-8">
          <div className="flex justify-center lg:justify-start">
            <div className="relative">
              <PlayerCard
                playerId={playerId}
                playerName={player?.full_name || 'Jugador'}
                position={player?.position}
                jerseyNumber={player?.jersey_number || undefined}
                photoUrl={playerPhotoUrl}
                rating={calculateRating()}
                stats={calculateStats()}
                isHighlighted={stats ? stats.total_goals > 10 || stats.avg_rating >= 4.5 : false}
              />
              {user?.id === playerId && (
                <label
                  htmlFor="photo-upload"
                  className="absolute top-4 left-4 p-3 bg-emerald-600 text-white rounded-full cursor-pointer hover:bg-emerald-700 transition-all shadow-xl hover:scale-110 z-10"
                >
                  <Upload className="h-5 w-5" />
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
              )}
              {uploading && (
                <div className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center z-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent"></div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 space-y-6">
            {/* Header Card with Gradient */}
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-8">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <h1 className="text-4xl font-black text-white tracking-tight">
                        {player.full_name}
                      </h1>
                      {player.estado_verificacion && (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${
                          player.estado_verificacion === 'verificado'
                            ? 'bg-green-500 text-white'
                            : player.estado_verificacion === 'rechazado'
                            ? 'bg-red-500 text-white'
                            : 'bg-yellow-500 text-white'
                        }`}>
                          {player.estado_verificacion === 'verificado' ? (
                            <><CheckCircle2 className="h-3 w-3" /> VERIFICADO</>
                          ) : player.estado_verificacion === 'rechazado' ? (
                            <><XCircle className="h-3 w-3" /> RECHAZADO</>
                          ) : (
                            <><Clock className="h-3 w-3" /> PENDIENTE</>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mb-6">
                      {player.position && (
                        <span className="px-4 py-1.5 bg-white/20 backdrop-blur-sm text-white rounded-full text-sm font-bold border border-white/30">
                          {player.position.toUpperCase()}
                        </span>
                      )}
                      {player.jersey_number && (
                        <span className="px-4 py-1.5 bg-white/20 backdrop-blur-sm text-white rounded-full text-sm font-bold border border-white/30">
                          #{player.jersey_number}
                        </span>
                      )}
                      {player.date_of_birth && (
                        <span className="px-4 py-1.5 bg-white/20 backdrop-blur-sm text-white rounded-full text-sm font-bold border border-white/30">
                          {calculateAge(player.date_of_birth)} AÑOS
                        </span>
                      )}
                    </div>

                    {/* Quick Stats */}
                    {stats && (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <div className="text-3xl font-black text-white mb-1">{stats.matches_played}</div>
                          <div className="text-xs text-white/80 font-medium uppercase">Partidos</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-black text-white mb-1">{stats.total_goals}</div>
                          <div className="text-xs text-white/80 font-medium uppercase">Goles</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-black text-white mb-1">{stats.total_assists}</div>
                          <div className="text-xs text-white/80 font-medium uppercase">Asistencias</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {user?.id === playerId ? (
                      <>
                        <a
                          href="/credential"
                          className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all text-sm font-bold shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center gap-2"
                        >
                          <QrCode className="h-4 w-4" />
                          Ver Credencial
                        </a>
                        <button
                          onClick={() => setShowEditForm(!showEditForm)}
                          className="px-6 py-3 bg-white text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all text-sm font-bold shadow-lg hover:shadow-xl hover:scale-105"
                        >
                          Editar Perfil
                        </button>
                      </>
                    ) : user ? (
                      <button
                        onClick={() => setShowMessageModal(true)}
                        className="px-6 py-3 bg-white text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all text-sm font-bold flex items-center gap-2 shadow-lg hover:shadow-xl hover:scale-105"
                      >
                        <Send className="h-4 w-4" />
                        Enviar Mensaje
                      </button>
                    ) : null}
                    {profile && ['system_admin', 'admin_de_campeonato', 'encargado_turno'].includes(profile.role) && user?.id !== playerId && (
                      <div className="mt-4 p-4 bg-white/20 rounded-xl border border-white/30">
                        <p className="text-white text-xs font-bold uppercase tracking-wider mb-3">Control de Verificación</p>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={async () => {
                              try {
                                await supabase
                                  .from('player_profiles')
                                  .update({ estado_verificacion: 'verificado' })
                                  .eq('id', playerId);
                                fetchPlayerData();
                              } catch (error) {
                                console.error('Error:', error);
                              }
                            }}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all text-xs font-bold flex items-center justify-center gap-2"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Verificar
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await supabase
                                  .from('player_profiles')
                                  .update({ estado_verificacion: 'rechazado' })
                                  .eq('id', playerId);
                                fetchPlayerData();
                              } catch (error) {
                                console.error('Error:', error);
                              }
                            }}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all text-xs font-bold flex items-center justify-center gap-2"
                          >
                            <XCircle className="h-4 w-4" />
                            Rechazar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Rating Bar */}
              {stats && stats.avg_rating > 0 && (
                <div className="bg-white/10 backdrop-blur-sm border-t border-white/20 px-8 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-5 w-5 ${
                              i < Math.round(stats.avg_rating)
                                ? 'text-yellow-400 fill-current'
                                : 'text-white/30'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-2xl font-black text-white">{stats.avg_rating.toFixed(1)}</span>
                    </div>
                    <span className="text-sm text-white/90 font-medium">
                      {stats.review_count} {stats.review_count === 1 ? 'reseña' : 'reseñas'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Bio Card */}
            {player.bio && (
              <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-emerald-600">
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <User className="h-5 w-5 text-emerald-600" />
                  Biografía
                </h3>
                <p className="text-gray-700 leading-relaxed">{player.bio}</p>
              </div>
            )}

        {showEditForm && user?.id === playerId && (
          <div className="bg-white rounded-2xl shadow-xl p-8 border-t-4 border-emerald-600">
            <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <User className="h-6 w-6 text-emerald-600" />
              </div>
              Editar Perfil
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                try {
                  // Update player profile data
                  const { error: profileError } = await supabase
                    .from('player_profiles')
                    .update({
                      position: formData.get('position') as string || null,
                      jersey_number: formData.get('jersey_number') ? parseInt(formData.get('jersey_number') as string) : null,
                      date_of_birth: formData.get('date_of_birth') as string || null,
                      bio: formData.get('bio') as string || null,
                    })
                    .eq('id', playerId);

                  if (profileError) throw profileError;

                  // Update full name in profiles table
                  const fullName = formData.get('full_name') as string;
                  if (fullName && fullName.trim()) {
                    // Get current profile to maintain the role
                    const { data: currentProfile } = await supabase
                      .from('profiles')
                      .select('role')
                      .eq('id', playerId)
                      .single();

                    if (currentProfile) {
                      const { error: nameError } = await supabase
                        .from('profiles')
                        .update({
                          full_name: fullName.trim(),
                          role: currentProfile.role
                        })
                        .eq('id', playerId);

                      if (nameError) throw nameError;
                    }
                  }

                  setShowEditForm(false);
                  fetchPlayerData();
                } catch (error) {
                  console.error('Error updating profile:', error);
                  alert('Error al actualizar el perfil');
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  name="full_name"
                  defaultValue={player.full_name}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Posición
                </label>
                <select
                  name="position"
                  defaultValue={player.position || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="">Seleccionar posición</option>
                  <option value="Portero">Portero</option>
                  <option value="Defensa">Defensa</option>
                  <option value="Mediocampista">Mediocampista</option>
                  <option value="Delantero">Delantero</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Número de Camiseta
                </label>
                <input
                  type="number"
                  name="jersey_number"
                  min="1"
                  max="99"
                  defaultValue={player.jersey_number || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha de Nacimiento
                </label>
                <input
                  type="date"
                  name="date_of_birth"
                  defaultValue={player.date_of_birth || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Biografía
                </label>
                <textarea
                  name="bio"
                  rows={4}
                  defaultValue={player.bio || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Cuéntanos sobre ti..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold shadow-lg hover:shadow-xl hover:scale-105"
                >
                  Guardar Cambios
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditForm(false)}
                  className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-bold hover:border-gray-400"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl shadow-xl p-6 text-center transform hover:scale-105 transition-transform">
              <TrendingUp className="h-10 w-10 text-white mx-auto mb-3 opacity-90" />
              <p className="text-4xl font-black text-white mb-1">{stats.matches_played}</p>
              <p className="text-sm text-blue-100 font-semibold uppercase tracking-wide">Partidos</p>
            </div>
            <div className="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-2xl shadow-xl p-6 text-center transform hover:scale-105 transition-transform">
              <Award className="h-10 w-10 text-white mx-auto mb-3 opacity-90" />
              <p className="text-4xl font-black text-white mb-1">{stats.total_goals}</p>
              <p className="text-sm text-yellow-100 font-semibold uppercase tracking-wide">Goles</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-teal-700 rounded-2xl shadow-xl p-6 text-center transform hover:scale-105 transition-transform">
              <Award className="h-10 w-10 text-white mx-auto mb-3 opacity-90" />
              <p className="text-4xl font-black text-white mb-1">{stats.total_assists}</p>
              <p className="text-sm text-emerald-100 font-semibold uppercase tracking-wide">Asistencias</p>
            </div>
            <div className="bg-gradient-to-br from-gray-700 to-gray-900 rounded-2xl shadow-xl p-6 text-center transform hover:scale-105 transition-transform">
              <div className="flex justify-center gap-2 mb-3">
                <div className="w-5 h-8 bg-yellow-400 rounded shadow-lg"></div>
                <div className="w-5 h-8 bg-red-500 rounded shadow-lg"></div>
              </div>
              <p className="text-4xl font-black text-white mb-1">
                {stats.total_yellow_cards} / {stats.total_red_cards}
              </p>
              <p className="text-sm text-gray-300 font-semibold uppercase tracking-wide">Tarjetas</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl shadow-xl p-8 border-t-4 border-emerald-600">
            <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Calendar className="h-6 w-6 text-emerald-600" />
              </div>
              Historial de Equipos
            </h2>
            {teamHistory.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Calendar className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium">No hay historial de equipos disponible</p>
              </div>
            ) : (
              <div className="space-y-4">
                {teamHistory.map((team, idx) => (
                  <div key={idx} className="group hover:bg-gray-50 transition-colors rounded-lg p-4 border-l-4 border-emerald-500">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-gray-900 text-lg group-hover:text-emerald-600 transition-colors">{team.team_name}</p>
                      {team.is_active && (
                        <span className="px-3 py-1 bg-emerald-500 text-white rounded-full text-xs font-bold uppercase shadow-sm">
                          Activo
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 font-medium">
                      {new Date(team.joined_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
                      {team.left_at && ` - ${new Date(team.left_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 border-t-4 border-blue-600">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <MessageSquare className="h-6 w-6 text-blue-600" />
                </div>
                Reseñas
              </h2>
              {user && user.id !== playerId && (
                <button
                  onClick={() => setShowReviewForm(!showReviewForm)}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all text-sm font-bold shadow-lg hover:shadow-xl hover:scale-105"
                >
                  Escribir Reseña
                </button>
              )}
            </div>

            {showReviewForm && (
              <form onSubmit={handleSubmitReview} className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Calificación
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => setReviewForm({ ...reviewForm, rating })}
                        className={`p-2 rounded ${
                          reviewForm.rating >= rating
                            ? 'text-yellow-500'
                            : 'text-gray-300'
                        }`}
                      >
                        <Star className="h-6 w-6 fill-current" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Comentario (opcional)
                  </label>
                  <textarea
                    value={reviewForm.comment}
                    onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    placeholder="Comparte tu opinión sobre este jugador..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    {submittingReview ? 'Enviando...' : 'Enviar Reseña'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReviewForm(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {reviews.length === 0 ? (
              <p className="text-gray-600">No hay reseñas aún</p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {reviews.map((review) => (
                  <div key={review.id} className="border-b border-gray-200 pb-4 last:border-0">
                    <div className="flex items-start gap-3">
                      {review.reviewer.avatar_url ? (
                        <img
                          src={review.reviewer.avatar_url}
                          alt={review.reviewer.full_name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                          <User className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-gray-900">{review.reviewer.full_name}</p>
                          <div className="flex gap-0.5">
                            {Array.from({ length: review.rating }).map((_, i) => (
                              <Star key={i} className="h-4 w-4 text-yellow-500 fill-current" />
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">
                          {new Date(review.created_at).toLocaleDateString()}
                        </p>
                        {review.comment && (
                          <p className="mt-2 text-gray-700">{review.comment}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Message Modal */}
        {showMessageModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 transform animate-slideUp border-t-4 border-blue-600">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <Send className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900">
                    Enviar Mensaje
                  </h3>
                  <p className="text-sm text-gray-600">a {player.full_name}</p>
                </div>
              </div>
              <form onSubmit={handleSendMessage} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Mensaje
                  </label>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    rows={5}
                    required
                    placeholder="Escribe tu mensaje aquí..."
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMessageModal(false);
                      setMessageText('');
                    }}
                    className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-bold hover:border-gray-400"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={sendingMessage || !messageText.trim()}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-105"
                  >
                    <Send className="h-4 w-4" />
                    {sendingMessage ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
