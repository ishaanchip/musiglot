import React from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import AuthPage from './pages/AuthPage.jsx';
import LanguagePage from './pages/LanguagePage.jsx';
import CatalogPage from './pages/CatalogPage.jsx';
import PracticePage from './pages/PracticePage.jsx';
import ResultsPage from './pages/ResultsPage.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  const { user, logout } = useAuth();
  return (
    <div className="app">
      {user && (
        <header className="topbar">
          <Link to="/languages" className="brand">
            Musiglot
          </Link>
          <span className="topbar-divider" aria-hidden="true" />
          <nav aria-label="Main">
            <NavLink to="/languages">Languages</NavLink>
            <NavLink to="/catalog/es">Spanish</NavLink>
            <NavLink to="/catalog/hi">Hindi</NavLink>
          </nav>
          <div className="topbar-account">
            <span className="topbar-email">{user.email}</span>
            <button className="topbar-logout" onClick={logout}>
              Log out
            </button>
          </div>
        </header>
      )}
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/languages" element={<Protected><LanguagePage /></Protected>} />
        <Route path="/catalog/:language" element={<Protected><CatalogPage /></Protected>} />
        <Route path="/practice/:slug" element={<Protected><PracticePage /></Protected>} />
        <Route path="/results/:attemptId" element={<Protected><ResultsPage /></Protected>} />
        <Route path="*" element={<Navigate to={localStorage.getItem('musiglot.language') ? `/catalog/${localStorage.getItem('musiglot.language')}` : '/languages'} replace />} />
      </Routes>
    </div>
  );
}
