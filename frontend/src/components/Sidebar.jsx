import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { workplacesApi } from '../api/workplaces';

const navItems = [
  {
    path: '',
    label: 'Dashboard',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
    enabled: true,
    exact: true,
  },
  {
    path: '/units',
    label: 'Units',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
      </svg>
    ),
    enabled: true,
  },
  {
    path: '/connectors',
    label: 'Connectors',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    ),
    enabled: true,
  },
  {
    path: '/pipelines',
    label: 'Pipelines',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    enabled: false,
    comingSoon: true,
  },
  {
    path: '/agent',
    label: 'Agent',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" /><path d="M8.24 9.93C6.4 9.58 5 7.95 5 6a4 4 0 0 1 4-4" />
        <path d="M2 17.5A4.5 4.5 0 0 1 6.5 13h11a4.5 4.5 0 0 1 0 9h-11A4.5 4.5 0 0 1 2 17.5z" />
      </svg>
    ),
    enabled: true,
  },
  {
    path: '/assets',
    label: 'Assets',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
    enabled: true,
  },
  {
    path: '/channels',
    label: 'Channels',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" />
      </svg>
    ),
    enabled: false,
    comingSoon: true,
  },
  {
    path: '/memory',
    label: 'Memory',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
    enabled: true,
  },
  {
    path: '/history',
    label: 'History',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      </svg>
    ),
    enabled: true,
  },
];

export default function Sidebar() {
  const location = useLocation();
  const { id } = useParams();
  const { user, logout } = useAuth();
  const [workplace, setWorkplace] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const basePath = `/workplaces/${id}`;

  useEffect(() => {
    if (id) {
      workplacesApi.get(id).then(setWorkplace).catch(() => {});
    }
  }, [id]);

  const isActive = (item) => {
    const fullPath = basePath + item.path;
    if (item.exact) {
      return location.pathname === fullPath;
    }
    return location.pathname.startsWith(fullPath);
  };

  return (
    <>
      <aside className={`${collapsed ? 'w-14' : 'w-[220px]'} bg-secondary border-r border-border flex flex-col flex-shrink-0 z-50 transition-all duration-200 max-md:w-14`}>
        {/* Workspace name + back */}
        <div className="px-4 py-[18px] border-b border-border">
          <NavLink
            to="/workplaces"
            className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-accent no-underline mb-2 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="max-md:hidden">{!collapsed && 'All Workplaces'}</span>
          </NavLink>
          <div className="flex items-center gap-2.5">
            <span className="text-accent text-lg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </span>
            <span className="text-[14px] font-bold text-text-primary truncate max-md:hidden">
              {!collapsed && (workplace?.name || 'Workspace')}
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 flex flex-col gap-0.5">
          {navItems.map(item => {
            if (!item.enabled) {
              return (
                <div
                  key={item.path || 'dashboard'}
                  className="group relative flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[13px] font-medium text-text-muted/40 cursor-not-allowed"
                  title={item.comingSoon ? 'Coming Soon' : ''}
                >
                  <span className="w-5 text-center flex-shrink-0 opacity-40">{item.icon}</span>
                  <span className="max-md:hidden opacity-40">{!collapsed && item.label}</span>
                  {item.comingSoon && !collapsed && (
                    <span className="ml-auto text-[9px] uppercase tracking-wider text-text-muted/30 font-semibold max-md:hidden">Soon</span>
                  )}
                  {/* Tooltip for collapsed */}
                  {item.comingSoon && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-elevated border border-border rounded text-[11px] text-text-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      {item.label} - Coming Soon
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={item.path || 'dashboard'}
                to={basePath + item.path}
                end={item.exact}
                className={() =>
                  `flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                    isActive(item)
                      ? 'bg-accent-dim text-accent'
                      : 'text-text-secondary hover:bg-elevated hover:text-text-primary'
                  }`
                }
              >
                <span className="w-5 text-center flex-shrink-0">{item.icon}</span>
                <span className="max-md:hidden">{!collapsed && item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border">
          <div className="px-3 py-2.5 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-accent-dim flex items-center justify-center flex-shrink-0">
              <span className="text-accent text-xs font-bold">{user?.username?.[0]?.toUpperCase() || '?'}</span>
            </div>
            <span className="flex-1 text-xs text-text-secondary truncate max-md:hidden">
              {!collapsed && (user?.username || '')}
            </span>
            <button
              onClick={logout}
              className="text-text-muted hover:text-danger transition-colors max-md:hidden bg-transparent border-none cursor-pointer"
              title="Sign out"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
