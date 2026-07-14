import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { unitsApi } from '../api/units';
import { executionsApi } from '../api/executions';
import { useToast } from '../hooks/useToast';
import { usePolling } from '../hooks/usePolling';
import { formatRelativeTime, formatDateTime, formatDuration } from '../utils/formatters';
import StatusBadge from '../components/StatusBadge';
import StatsBar from '../components/StatsBar';
import EmptyState from '../components/EmptyState';

export default function UnitDetail() {
  const { id: workplaceId, unitId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [unit, setUnit] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchData = async () => {
    try {
      const [u, allExecs] = await Promise.all([
        unitsApi.get(workplaceId, unitId),
        executionsApi.list(workplaceId),
      ]);
      setUnit(u);
      // Filter executions for this unit
      const unitExecs = (Array.isArray(allExecs) ? allExecs : []).filter(e => e.unit_id === unitId);
      setExecutions(unitExecs);
    } catch (err) {
      addToast('Failed to load unit', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [workplaceId, unitId]);
  usePolling(fetchData, 5000, running);

  const handleRun = async () => {
    try {
      setRunning(true);
      await unitsApi.run(workplaceId, unitId);
      addToast('Unit triggered', 'success');
      setTimeout(fetchData, 1000);
    } catch (err) {
      addToast('Failed to run: ' + err.message, 'error');
      setRunning(false);
    }
  };

  useEffect(() => {
    if (executions.some(e => e.status === 'running' || e.status === 'pending')) {
      setRunning(true);
    } else {
      setRunning(false);
    }
  }, [executions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-text-muted">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  if (!unit) {
    return <EmptyState title="Unit not found" description="This unit doesn't exist or was deleted." />;
  }

  const completed = executions.filter(e => e.status === 'completed').length;
  const failed = executions.filter(e => e.status === 'failed').length;
  const total = executions.length;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const lastExec = executions[0] || null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-xs text-text-muted mb-1">
            <button onClick={() => navigate(`/workplaces/${workplaceId}/units`)} className="hover:text-accent bg-transparent border-none cursor-pointer text-text-muted">
              Units
            </button>
            {' / '}{unit.name}
          </div>
          <h2 className="text-xl font-bold text-text-primary">{unit.name}</h2>
          {unit.description && (
            <p className="text-sm text-text-secondary mt-1">{unit.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={unit.type || 'script'} />
            <span className="text-xs text-text-muted">{unit.step_count || 0} steps</span>
            {unit.enabled ? (
              <span className="text-xs text-success">Enabled</span>
            ) : (
              <span className="text-xs text-text-muted">Disabled</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/workplaces/${workplaceId}/units/${unitId}/edit`)}
            className="px-4 py-2 bg-elevated border border-border text-text-secondary hover:text-text-primary rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Edit Unit
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer border-none disabled:opacity-50"
          >
            {running ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running...
              </span>
            ) : 'Run Now'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-2xl font-bold text-text-primary">{total}</div>
          <div className="text-xs text-text-muted uppercase tracking-wider mt-1">Total Runs</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-2xl font-bold text-success">{completed}</div>
          <div className="text-xs text-text-muted uppercase tracking-wider mt-1">Completed</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-2xl font-bold text-danger">{failed}</div>
          <div className="text-xs text-text-muted uppercase tracking-wider mt-1">Failed</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className={`text-2xl font-bold ${successRate >= 80 ? 'text-success' : successRate >= 50 ? 'text-warning' : 'text-danger'}`}>
            {successRate}%
          </div>
          <div className="text-xs text-text-muted uppercase tracking-wider mt-1">Success Rate</div>
        </div>
      </div>

      {/* Last Run Summary */}
      {lastExec && (
        <div className={`mb-6 p-4 rounded-lg border ${
          lastExec.status === 'completed' ? 'border-success/30 bg-success/5' :
          lastExec.status === 'failed' ? 'border-danger/30 bg-danger/5' :
          lastExec.status === 'running' ? 'border-accent/30 bg-accent/5' :
          'border-border bg-card'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusBadge status={lastExec.status} />
              <span className="text-sm text-text-primary font-medium">Last run</span>
              <span className="text-xs text-text-muted">{formatRelativeTime(lastExec.started_at)}</span>
            </div>
            <button
              onClick={() => navigate(`/workplaces/${workplaceId}/executions/${lastExec.id}`)}
              className="text-xs text-accent hover:text-accent-hover bg-transparent border-none cursor-pointer"
            >
              View Details →
            </button>
          </div>
          {lastExec.started_at && lastExec.finished_at && (
            <div className="text-xs text-text-muted mt-2">
              Duration: {formatDuration(lastExec.started_at, lastExec.finished_at)} · {formatDateTime(lastExec.started_at)}
            </div>
          )}
        </div>
      )}

      {/* Execution History */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Execution History</h3>
          <span className="text-xs text-text-muted">{executions.length} runs</span>
        </div>

        {executions.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">
            No executions yet. Click "Run Now" to execute this unit.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {executions.map(exe => (
              <div
                key={exe.id}
                onClick={() => navigate(`/workplaces/${workplaceId}/executions/${exe.id}`)}
                className="flex items-center justify-between px-4 py-3 hover:bg-elevated/50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={exe.status} />
                  <div>
                    <div className="text-sm text-text-primary">{formatDateTime(exe.started_at)}</div>
                    <div className="text-xs text-text-muted">{formatRelativeTime(exe.started_at)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-muted">
                  <span>{exe.trigger_type || 'manual'}</span>
                  {exe.started_at && exe.finished_at && (
                    <span className="font-mono">{formatDuration(exe.started_at, exe.finished_at)}</span>
                  )}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
