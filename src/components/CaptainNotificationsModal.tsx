import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Check, XCircle, Bell } from 'lucide-react';
import { ChampionshipNotification } from '../types/database';

interface CaptainNotificationsModalProps {
  onClose: () => void;
  onUpdate: () => void;
}

export const CaptainNotificationsModal = ({ onClose, onUpdate }: CaptainNotificationsModalProps) => {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<ChampionshipNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const { data } = await supabase
        .from('championship_notifications')
        .select('*, championship:championships(name), team_registration:team_registrations(base_team:base_teams(name))')
        .eq('user_id', profile?.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (data) setNotifications(data as any);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (notificationId: string, response: 'accepted' | 'rejected') => {
    setProcessingId(notificationId);
    try {
      const notification = notifications.find(n => n.id === notificationId);
      if (!notification) return;

      const { error: notifError } = await supabase
        .from('championship_notifications')
        .update({
          status: response,
          responded_at: new Date().toISOString(),
        })
        .eq('id', notificationId);

      if (notifError) throw notifError;

      if (notification.team_registration_id) {
        const { data: registration } = await supabase
          .from('team_registrations')
          .select('base_team_id, championship_id')
          .eq('id', notification.team_registration_id)
          .maybeSingle();

        const { error: regError } = await supabase
          .from('team_registrations')
          .update({
            status: response === 'accepted' ? 'confirmed' : 'rejected',
          })
          .eq('id', notification.team_registration_id);

        if (regError) throw regError;

        if (registration) {
          const updateData = response === 'accepted'
            ? { captain_confirmed: true, captain_confirmed_at: new Date().toISOString(), is_enabled: true }
            : { captain_confirmed: false, is_enabled: false };

          const { error: teamError } = await supabase
            .from('teams')
            .update(updateData)
            .eq('championship_id', registration.championship_id)
            .eq('base_team_id', registration.base_team_id);

          if (teamError) throw teamError;
        }
      }

      await fetchNotifications();
      onUpdate();

      if (notifications.length === 1) {
        setTimeout(() => onClose(), 1000);
      }
    } catch (error: any) {
      console.error('Error responding to notification:', error);
      alert(error.message || 'Error al responder a la notificación');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="border-b px-6 py-4 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <Bell className="h-6 w-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">Notificaciones de Capitán</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">No tienes notificaciones pendientes</p>
            </div>
          ) : (
            <div className="space-y-4">
              {notifications.map((notification) => (
                <div key={notification.id} className="border border-blue-200 bg-blue-50 rounded-lg p-6">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Confirmación de Capitán
                    </h3>
                    <p className="text-gray-700 mb-2">{notification.message}</p>
                    <div className="text-sm text-gray-600 space-y-1">
                      {notification.championship && (
                        <p>
                          <span className="font-medium">Campeonato:</span> {(notification.championship as any).name}
                        </p>
                      )}
                      {notification.team_registration && (
                        <p>
                          <span className="font-medium">Equipo:</span>{' '}
                          {(notification.team_registration as any).base_team?.name}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        {new Date(notification.created_at).toLocaleString('es-ES', {
                          dateStyle: 'long',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleResponse(notification.id, 'accepted')}
                      disabled={processingId === notification.id}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check className="h-5 w-5" />
                      {processingId === notification.id ? 'Procesando...' : 'Aceptar'}
                    </button>
                    <button
                      onClick={() => handleResponse(notification.id, 'rejected')}
                      disabled={processingId === notification.id}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <XCircle className="h-5 w-5" />
                      {processingId === notification.id ? 'Procesando...' : 'Rechazar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
