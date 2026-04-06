import { useEffect, useState } from 'react';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Search } from './pages/Search';
import { ChampionshipDetail } from './pages/ChampionshipDetail';
import { MyTeams } from './pages/MyTeams';
import { Messages } from './pages/Messages';
import { Admin } from './pages/Admin';
import Teams from './pages/Teams';
import { PlayerProfile } from './pages/PlayerProfile';
import { LiveMatches } from './pages/LiveMatches';
import { PlayerCredentialPage } from './pages/PlayerCredential';
import { ValidatePlayer } from './pages/ValidatePlayer';

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);

    const originalPushState = window.history.pushState;
    window.history.pushState = function(...args) {
      originalPushState.apply(window.history, args);
      handleLocationChange();
    };

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.history.pushState = originalPushState;
    };
  }, []);

  if (currentPath === '/login') return <Login />;
  if (currentPath === '/register') return <Register />;
  if (currentPath === '/search') return <Search />;
  if (currentPath.startsWith('/championship/')) return <ChampionshipDetail />;
  if (currentPath.startsWith('/player/')) return <PlayerProfile />;
  if (currentPath === '/my-teams') return <MyTeams />;
  if (currentPath === '/messages') return <Messages />;
  if (currentPath === '/admin') return <Admin />;
  if (currentPath === '/live-matches') return <LiveMatches />;
  if (currentPath === '/teams') return <Teams />;
  if (currentPath === '/credential') return <PlayerCredentialPage />;
  if (currentPath.startsWith('/validate')) return <ValidatePlayer />;

  return <Home />;
}

export default App;
