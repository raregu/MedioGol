import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { safeNext, withNext } from '../utils/safeNext';
import { Trophy, Mail, Lock, User, AlertCircle, Flag, Users } from 'lucide-react';
import { FREE_PLAN } from '../hooks/useOrganizerPlan';

type AccountType = 'player' | 'organizer';

export const Register = () => {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // /register?organizador=1 (desde "Organiza tu liga") llega con la opción de organizador elegida
  const [accountType, setAccountType] = useState<AccountType>(() =>
    new URLSearchParams(window.location.search).get('organizador') === '1' ? 'organizer' : 'player'
  );
  const isOrganizer = accountType === 'organizer';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      setLoading(false);
      return;
    }

    try {
      await signUp(email, password, fullName, { organizer: isOrganizer });
      window.location.href = safeNext(isOrganizer ? '/admin' : '/');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'Error al crear la cuenta. Por favor, intenta de nuevo.');
      } else {
        setError('Error al crear la cuenta. Por favor, intenta de nuevo.');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-md w-full border-t-4 border-emerald-600">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl mb-6 shadow-lg">
              <Trophy className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-4xl font-black text-gray-900 tracking-tight">Crear Cuenta</h2>
            <p className="text-gray-600 mt-3 font-medium">Únete a Mediogol hoy</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-3 animate-slideUp">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 font-semibold">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <fieldset>
              <legend className="block text-sm font-bold text-gray-700 mb-2">¿Para qué usarás MedioGol?</legend>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'player' as const, icon: Users, title: 'Juego o soy capitán', text: 'Sigo mi equipo y mis estadísticas' },
                  { value: 'organizer' as const, icon: Flag, title: 'Organizo una liga', text: 'Administro campeonatos y resultados' },
                ]).map(({ value, icon: Icon, title, text }) => (
                  <label
                    key={value}
                    className={`flex flex-col gap-1 rounded-xl border-2 p-3 cursor-pointer transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-emerald-600 ${
                      accountType === value ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="accountType"
                      value={value}
                      checked={accountType === value}
                      onChange={() => setAccountType(value)}
                      className="sr-only"
                    />
                    <Icon className={`h-5 w-5 ${accountType === value ? 'text-emerald-700' : 'text-gray-400'}`} aria-hidden="true" />
                    <span className="font-bold text-sm text-gray-900">{title}</span>
                    <span className="text-xs text-gray-600">{text}</span>
                  </label>
                ))}
              </div>
              {isOrganizer && (
                <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-gray-800">
                  <p className="font-bold text-emerald-800 mb-1">Plan Gratis para organizadores</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    <li>Publica {FREE_PLAN.leagues} liga con todas sus series.</li>
                    <li>{FREE_PLAN.months} meses gratis desde que creas tu liga.</li>
                    <li>{FREE_PLAN.sheets} papeletas de prueba con lectura automática.</li>
                  </ul>
                </div>
              )}
            </fieldset>

            <div>
              <label htmlFor="fullName" className="block text-sm font-bold text-gray-700 mb-2">
                Nombre completo
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all font-medium"
                  placeholder="Juan Pérez"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-2">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all font-medium"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-bold text-gray-700 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all font-medium"
                  placeholder="••••••••"
                />
              </div>
              <p className="mt-1 text-sm text-gray-500">Mínimo 6 caracteres</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-700 text-white py-4 rounded-xl hover:from-emerald-600 hover:to-emerald-800 transition-all font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
            >
              {loading ? 'Creando cuenta...' : isOrganizer ? 'Crear cuenta de organizador' : 'Crear Cuenta'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-gray-600 font-medium">
              ¿Ya tienes una cuenta?{' '}
              <a href={withNext('/login')} className="text-emerald-600 hover:text-emerald-700 font-bold">
                Inicia sesión aquí
              </a>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};
