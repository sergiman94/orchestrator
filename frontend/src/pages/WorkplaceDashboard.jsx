import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { workplacesApi } from '../api/workplaces';
import { useToast } from '../hooks/useToast';
import { usePolling } from '../hooks/usePolling';
import { formatRelativeTime, formatDateTime, formatDuration } from '../utils/formatters';
import StatsBar from '../components/StatsBar';
import StatusBadge from '../components/StatusBadge';

export default function WorkplaceDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    try {
      const data = await workplacesApi.dashboard(id);
      setDashboard(data);
    } catch (err) {
      if (loading) addToast('Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [id]);

  usePolling(fetchDashboard, 10000);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-text-muted">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading dashboard...
        </div>
      </div>
    );
  }

  const stats = dashboard?.stats || {};
  const recentExecutions = dashboard?.recent_executions || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">{dashboard?.name || 'Dashboard'}</h1>
          {dashboard?.description && (
            <p className="text-sm text-text-muted mt-1">{dashboard.description}</p>
          )}
        </div>
        <button
          onClick={() => navigate(`/workplaces/${id}/units/new`)}
          className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer border-none"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Unit
        </button>
      </div>

      {/* Stats */}
      <StatsBar
        items={[
          { label: 'Units', value: stats.total_units ?? 0, color: '#6366f1' },
          { label: 'Enabled', value: stats.enabled_units ?? 0, color: '#22c55e' },
          { label: 'Executions', value: stats.total_executions ?? 0 },
          { label: 'Last Run', value: formatRelativeTime(stats.last_run), smallValue: true },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* Recent Activity */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-[14px] font-semibold text-text-primary mb-4">Recent Activity</h2>
          {recentExecutions.length === 0 ? (
            <p className="text-[13px] text-text-muted py-4">No executions yet. Run a unit to see activity here.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentExecutions.slice(0, 5).map((exec) => (
                <div
                  key={exec.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-elevated/50 hover:bg-elevated transition-colors"
                >
                  <StatusBadge status={exec.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-text-primary truncate">
                      {exec.unit_name || exec.pipeline_name || 'Execution'}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {formatRelativeTime(exec.started_at)}
                      {exec.finished_at && exec.started_at && (
                        <span className="ml-2 text-text-muted/60">
                          {formatDuration(exec.started_at, exec.finished_at)}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-[11px] text-text-muted capitalize">{exec.trigger_type || 'manual'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex flex-col gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-text-primary mb-4">Quick Actions</h2>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate(`/workplaces/${id}/units`)}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-elevated hover:bg-elevated/80 border border-transparent hover:border-border transition-all text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-accent-dim flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-text-primary">View Units</p>
                  <p className="text-[11px] text-text-muted">Manage your units of work</p>
                </div>
              </button>
              <button
                onClick={() => navigate(`/workplaces/${id}/units/new`)}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-elevated hover:bg-elevated/80 border border-transparent hover:border-border transition-all text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-success-dim flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-text-primary">Create Unit</p>
                  <p className="text-[11px] text-text-muted">Add a new unit of work</p>
                </div>
              </button>
            </div>
          </div>

          {/* Coming Soon cards */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-text-primary mb-4">Coming Soon</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'AI Agent', icon: 'M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93', desc: 'Autonomous supervisor' },
                { label: 'Memory', icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', desc: 'Shared context store' },
                { label: 'Channels', icon: 'M4 11a9 9 0 0 1 9 9', desc: 'Slack, email, webhooks' },
                { label: 'Pipelines', icon: 'M22 12 18 12 15 21 9 3 6 12 2 12', desc: 'Visual pipeline builder' },
              ].map(item => (
                <div key={item.label} className="px-3 py-3 rounded-lg bg-elevated/50 border border-border/30">
                  <p className="text-[12px] font-medium text-text-muted/60">{item.label}</p>
                  <p className="text-[10px] text-text-muted/40 mt-0.5">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
