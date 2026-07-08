import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { DataProvider, useData } from './lib/DataContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Roster from './pages/Roster';
import Checklist from './pages/Checklist';
import Log from './pages/Log';
import Charts from './pages/Charts';
import Settings from './pages/Settings';
import CreateTank from './pages/CreateTank';

function NewTankRoute() {
  const navigate = useNavigate();
  return <CreateTank onDone={() => navigate('/')} />;
}

// Gatekeeps the whole nav shell: no tank yet means no nav, no Dashboard,
// nothing but the onboarding flow. Once a tank exists, normal routing resumes.
function AppShell() {
  const { activeTank } = useData();

  if (!activeTank) {
    return <CreateTank />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/roster" element={<Roster />} />
        <Route path="/checklist" element={<Checklist />} />
        <Route path="/log" element={<Log />} />
        <Route path="/charts" element={<Charts />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/new-tank" element={<NewTankRoute />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <DataProvider>
      <HashRouter>
        <AppShell />
      </HashRouter>
    </DataProvider>
  );
}
