import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col h-screen">
      {/* Top header bar */}
      <header className="bg-secondary border-b border-border px-6 py-3 flex items-center justify-between flex-shrink-0">
        <Link to="/workplaces" className="flex items-center gap-2.5 no-underline">
          <span className="text-accent text-xl">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          </span>
          <span className="text-[15px] font-bold text-text-primary">Orchestrator</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-accent-dim flex items-center justify-center flex-shrink-0">
              <span className="text-accent text-xs font-bold">{user?.username?.[0]?.toUpperCase() || '?'}</span>
            </div>
            <span className="text-xs text-text-secondary">{user?.username || ''}</span>
          </div>
          <button
            onClick={logout}
            className="text-text-muted hover:text-danger transition-colors bg-transparent border-none cursor-pointer"
            title="Sign out"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
