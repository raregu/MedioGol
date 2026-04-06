import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Trophy, Search, Users, BarChart3, MessageSquare, LogOut, Menu, X, Bell, Shield } from 'lucide-react';
import { CaptainNotificationsModal } from './CaptainNotificationsModal';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { profile, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const [pendingNotifications, setPendingNotifications] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (profile) {
      fetchPendingInvitations();
      fetchPendingNotifications();
    }
  }, [profile]);

  const fetchPendingInvitations = async () => {
    try {
      const { data, count } = await supabase
        .from('invitations')
        .select('*', { count: 'exact', head: true })
        .eq('invited_user_id', profile?.id)
        .eq('status', 'pending');

      if (count !== null) {
        setPendingInvitations(count);
      }
    } catch (error) {
      console.error('Error fetching pending invitations:', error);
    }
  };

  const fetchPendingNotifications = async () => {
    try {
      const { data, count } = await supabase
        .from('championship_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile?.id)
        .eq('status', 'pending');

      if (count !== null) {
        setPendingNotifications(count);
      }
    } catch (error) {
      console.error('Error fetching pending notifications:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <nav className="bg-white/80 backdrop-blur-md shadow-lg sticky top-0 z-50 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl">
                <img src="/logo-mediogol.png" alt="Mediogol" className="h-8 w-auto" />
              </div>
              <span className="text-2xl font-black text-gray-900 tracking-tight">Mediogol</span>
            </div>

            <div className="hidden md:flex items-center space-x-2">
              <a href="/" className="px-4 py-2 text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all font-semibold flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Inicio
              </a>
              <a href="/search" className="px-4 py-2 text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all font-semibold flex items-center gap-2">
                <Search className="h-5 w-5" />
                Buscar
              </a>
              <a href="/teams" className="px-4 py-2 text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all font-semibold flex items-center gap-2">
                <Users className="h-5 w-5" />
                Equipos
              </a>
              {profile && (
                <>
                  <a href="/my-teams" className="px-4 py-2 text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all font-semibold flex items-center gap-2 relative">
                    <Users className="h-5 w-5" />
                    Mis Equipos
                    {pendingInvitations > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-lg animate-pulse">
                        {pendingInvitations}
                      </span>
                    )}
                  </a>
                  <a href="/messages" className="px-4 py-2 text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all font-semibold flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Mensajes
                  </a>
                  <a href="/live-matches" className="px-4 py-2 text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all font-semibold flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    Eventos
                  </a>
                  <a href="/credential" className="px-4 py-2 text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all font-semibold flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Mi Credencial
                  </a>
                  {['system_admin', 'admin_de_campeonato', 'encargado_turno'].includes(profile.role) && (
                    <a href="/validate" className="px-4 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all font-semibold flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Validar
                    </a>
                  )}
                  {profile.role !== 'usuario' && profile.role !== 'encargado_turno' && (
                    <a href="/admin" className="px-4 py-2 text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all font-semibold flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Administrar
                    </a>
                  )}
                </>
              )}
            </div>

            <div className="hidden md:flex items-center space-x-3">
              {profile ? (
                <div className="flex items-center gap-3">
                  {pendingNotifications > 0 && (
                    <button
                      onClick={() => setShowNotifications(true)}
                      className="relative p-2.5 text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                      title="Notificaciones de capitán"
                    >
                      <Bell className="h-5 w-5" />
                      <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-lg animate-pulse">
                        {pendingNotifications}
                      </span>
                    </button>
                  )}
                  <a href={`/player/${profile.id}`} className="text-right hover:bg-gray-100 px-3 py-2 rounded-xl transition-all">
                    <p className="text-sm font-bold text-gray-900">{profile.full_name}</p>
                    <p className="text-xs text-gray-600 capitalize font-medium">{profile.role.replace('_', ' ')}</p>
                  </a>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all shadow-lg hover:shadow-xl font-bold"
                  >
                    <LogOut className="h-4 w-4" />
                    Salir
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <a href="/login" className="px-5 py-2.5 text-emerald-600 hover:text-emerald-700 font-bold border-2 border-emerald-600 rounded-xl hover:bg-emerald-50 transition-all">
                    Iniciar Sesión
                  </a>
                  <a href="/register" className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-700 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-800 transition-all shadow-lg hover:shadow-xl font-bold">
                    Registrarse
                  </a>
                </div>
              )}
            </div>

            <div className="md:hidden flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t">
              <div className="flex flex-col space-y-3">
                <a href="/" className="text-gray-700 hover:text-emerald-600 py-2 flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Inicio
                </a>
                <a href="/search" className="text-gray-700 hover:text-emerald-600 py-2 flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Buscar
                </a>
                <a href="/teams" className="text-gray-700 hover:text-emerald-600 py-2 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Equipos
                </a>
                {profile && (
                  <>
                    <a href="/my-teams" className="text-gray-700 hover:text-emerald-600 py-2 flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Mis Equipos
                    </a>
                    <a href="/messages" className="text-gray-700 hover:text-emerald-600 py-2 flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Mensajes
                    </a>
                    <a href="/live-matches" className="text-gray-700 hover:text-emerald-600 py-2 flex items-center gap-2">
                      <Trophy className="h-5 w-5" />
                      Eventos
                    </a>
                    {profile.role !== 'usuario' && profile.role !== 'encargado_turno' && (
                      <a href="/admin" className="text-gray-700 hover:text-emerald-600 py-2 flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Administrar
                      </a>
                    )}
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors w-full justify-center mt-4"
                    >
                      <LogOut className="h-4 w-4" />
                      Salir
                    </button>
                  </>
                )}
                {!profile && (
                  <>
                    <a href="/login" className="px-4 py-2 text-emerald-600 hover:text-emerald-700 font-medium text-center border border-emerald-600 rounded-lg">
                      Iniciar Sesión
                    </a>
                    <a href="/register" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-center">
                      Registrarse
                    </a>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="bg-gradient-to-r from-gray-900 to-gray-800 border-t border-gray-700 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <div className="flex justify-center items-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl">
                <img src="/logo-mediogol.png" alt="Mediogol" className="h-8 w-auto" />
              </div>
              <p className="text-2xl font-black text-white">Mediogol</p>
            </div>
            <p className="text-gray-400 font-medium">Gestión profesional de campeonatos deportivos</p>
            <p className="text-gray-500 text-sm mt-4">© 2026 Mediogol. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>

      {showNotifications && (
        <CaptainNotificationsModal
          onClose={() => setShowNotifications(false)}
          onUpdate={() => {
            fetchPendingNotifications();
            fetchPendingInvitations();
          }}
        />
      )}
    </div>
  );
};
