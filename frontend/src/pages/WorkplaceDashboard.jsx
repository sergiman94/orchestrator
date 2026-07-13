import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { workplacesApi } from '../api/workplaces';
import { agentApi } from '../api/agent';
import { memoryApi } from '../api/memory';
import { executionsApi } from '../api/executions';
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
  const [agentConfig, setAgentConfig] = useState(null);
  const [memoryStats, setMemoryStats] = useState(null);
  const [recentExecs, setRecentExecs] = useState([]);

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

  const fetchExtras = async () => {
    // These are best-effort; don't block dashboard on them
    try { const a = await agentApi.getConfig(id); setAgentConfig(a); } catch {}
    try { const m = await memoryApi.getStats(id); setMemoryStats(m); } catch {}
    try {
      const e = await executionsApi.list(id);
      const list = Array.isArray(e) ? e : e.executions || [];
      setRecentExecs(list.slice(0, 5));
    } catch {}
  };

  useEffect(() => {
    fetchDashboard();
    fetchExtras();
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[14px] font-semibold text-text-primary">Recent Activity</h2>
            <button
              onClick={() => navigate(`/workplaces/${id}/history`)}
              className="text-[12px] text-accent hover:text-accent-hover font-medium bg-transparent border-none cursor-pointer transition-colors"
            >
              View All
            </button>
          </div>
          {(recentExecs.length > 0 ? recentExecs : recentExecutions).length === 0 ? (
            <p className="text-[13px] text-text-muted py-4">No executions yet. Run a unit to see activity here.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(recentExecs.length > 0 ? recentExecs : recentExecutions).slice(0, 5).map((exec) => (
                <div
                  key={exec.id}
                  onClick={() => navigate(`/workplaces/${id}/executions/${exec.id}`)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-elevated/50 hover:bg-elevated transition-colors cursor-pointer"
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

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Agent Card */}
          <div
            className="bg-card border border-border rounded-xl p-5 hover:border-border-light transition-colors cursor-pointer"
            onClick={() => navigate(`/workplaces/${id}/agent`)}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-semibold text-text-primary">AI Agent</h2>
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${agentConfig?.enabled ? 'text-success' : 'text-text-muted'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${agentConfig?.enabled ? 'bg-success shadow-[0_0_6px_#22c55e]' : 'bg-text-muted'}`} />
                {agentConfig?.enabled ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-[13px] text-text-secondary mb-2">
              {agentConfig?.name || 'Autonomous supervisor'}
            </p>
            <p className="text-[11px] text-text-muted">
              {agentConfig?.model || 'Not configured'} {agentConfig?.temperature != null ? `/ temp ${agentConfig.temperature}` : ''}
            </p>
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-1.5 text-accent text-[12px] font-medium">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Open Agent Panel
            </div>
          </div>

          {/* Memory Card */}
          <div
            className="bg-card border border-border rounded-xl p-5 hover:border-border-light transition-colors cursor-pointer"
            onClick={() => navigate(`/workplaces/${id}/memory`)}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-semibold text-text-primary">Shared Memory</h2>
              <span className="text-[13px] font-bold text-accent tabular-nums">
                {memoryStats?.total ?? 0}
              </span>
            </div>
            <p className="text-[13px] text-text-secondary">
              {memoryStats?.total ? `${memoryStats.total} entries stored` : 'No memories yet'}
            </p>
            {memoryStats?.by_source_type && Object.keys(memoryStats.by_source_type).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {Object.entries(memoryStats.by_source_type).map(([key, val]) => (
                  <span key={key} className="text-[10px] text-text-muted bg-elevated px-1.5 py-0.5 rounded">
                    {key.replace('_', ' ')}: {val}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-1.5 text-accent text-[12px] font-medium">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Browse Memory
            </div>
          </div>

          {/* Coming Soon cards (reduced) */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-text-primary mb-3">Coming Soon</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Channels', desc: 'Slack, email, webhooks' },
                { label: 'Pipelines', desc: 'Visual pipeline builder' },
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
