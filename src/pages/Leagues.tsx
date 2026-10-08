import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { LeagueCard } from '../components/LeagueCard';
import { LeagueManageModal } from '../components/admin/LeagueManageModal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { League } from '../types/database';
import { Layers, Plus } from 'lucide-react';

export const Leagues = () => {
  const { profile } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const canCreate = !!profile && ['admin_sistema', 'admin_campeonato'].includes(profile.role);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('leagues').select('*').order('created_at', { ascending: false });
    const all = (data || []) as League[];
    // Las ligas en borrador solo las ve su administrador o un admin del sistema
    setLeagues(all.filter((l) => l.status !== 'draft' || profile?.role === 'admin_sistema' || l.admin_id === profile?.id));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-xl">
              <Layers className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-gray-900">Ligas</h1>
              <p className="text-gray-600">Competencias con varias series y tabla general por club</p>
            </div>
          </div>
          {canCreate && (
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow">
              <Plus className="h-5 w-5" /> Crear liga
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
          </div>
        ) : leagues.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-12 text-center text-gray-600">Aún no hay ligas.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {leagues.map((l) => (
              <LeagueCard key={l.id} league={l} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <LeagueManageModal
          onClose={() => setShowCreate(false)}
          onSaved={(id) => {
            setShowCreate(false);
            window.history.pushState({}, '', `/league/${id}`);
          }}
        />
      )}
    </Layout>
  );
};
