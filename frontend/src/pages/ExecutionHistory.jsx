import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { executionsApi } from '../api/executions';
import { useToast } from '../hooks/useToast';
import { usePolling } from '../hooks/usePolling';
import { formatRelativeTime, formatDuration } from '../utils/formatters';
import StatsBar from '../components/StatsBar';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';

const STATUS_FILTERS = ['all', 'completed', 'failed', 'running', 'cancelled'];

export default function ExecutionHistory() {
  const { id: workplaceId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchExecutions = useCallback(async () => {
    try {
      const data = await executionsApi.list(workplaceId);
      setExecutions(Array.isArray(data) ? data : data.executions || []);
    } catch (err) {
      if (loading) addToast('Failed to load executions', 'error');
    } finally {
      setLoading(false);
    }
  }, [workplaceId]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  usePolling(fetchExecutions, 10000);

  const filtered = statusFilter === 'all'
    ? executions
    : executions.filter(e => e.status === statusFilter);

  const completedCount = executions.filter(e => e.status === 'completed').length;
  const failedCount = executions.filter(e => e.status === 'failed').length;
  const runningCount = executions.filter(e => e.status === 'running').length;
  const cancelledCount = executions.filter(e => e.status === 'cancelled').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-text-muted">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading executions...
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent-dim flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-text-primary">Execution History</h1>
        </div>
      </div>

      {/* Stats */}
      <StatsBar
        items={[
          { label: 'Total', value: executions.length, color: '#6366f1' },
          { label: 'Completed', value: completedCount, color: '#22c55e' },
          { label: 'Failed', value: failedCount, color: '#ef4444' },
          { label: 'Running', value: runningCount, color: '#f59e0b' },
          ...(cancelledCount > 0 ? [{ label: 'Cancelled', value: cancelledCount, color: '#9ca3af' }] : []),
        ]}
      />

      {/* Status filter */}
      <div className="flex items-center gap-1.5 mb-4">
        {STATUS_FILTERS.map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer border capitalize ${
              statusFilter === status
                ? 'bg-accent-dim border-accent text-accent'
                : 'bg-elevated border-border text-text-secondary hover:text-text-primary hover:border-border-light'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          }
          title={statusFilter !== 'all' ? `No ${statusFilter} executions` : 'No executions yet'}
          description={statusFilter !== 'all'
            ? 'Try clearing the filter or running a unit.'
            : 'Run a unit to see execution history here.'
          }
        />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1fr_100px_120px_80px_60px] gap-3 px-5 py-3 border-b border-border bg-elevated/50">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Unit</span>
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Trigger</span>
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Status</span>
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Started</span>
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Duration</span>
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider" />
          </div>

          {/* Rows */}
          {filtered.map((exec) => (
            <div
              key={exec.id}
              onClick={() => navigate(`/workplaces/${workplaceId}/executions/${exec.id}`)}
              className="grid grid-cols-[2fr_1fr_100px_120px_80px_60px] gap-3 px-5 py-3 border-b border-border last:border-b-0 hover:bg-elevated/50 cursor-pointer transition-colors group"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-text-primary truncate">
                  {exec.unit_name || exec.pipeline_name || 'Execution'}
                </p>
                <p className="text-[10px] text-text-muted font-mono truncate mt-0.5">
                  {exec.id?.substring(0, 8)}
                </p>
              </div>

              <div className="flex items-center">
                <span className="text-[12px] text-text-secondary capitalize">
                  {exec.trigger_type || 'manual'}
                </span>
              </div>

              <div className="flex items-center">
                <StatusBadge status={exec.status} />
              </div>

              <div className="flex items-center">
                <span className="text-[12px] text-text-muted">
                  {formatRelativeTime(exec.started_at)}
                </span>
              </div>

              <div className="flex items-center">
                <span className="text-[12px] text-text-muted font-mono">
                  {exec.finished_at && exec.started_at
                    ? formatDuration(exec.started_at, exec.finished_at)
                    : exec.status === 'running' ? '...' : '-'
                  }
                </span>
              </div>

              <div className="flex items-center justify-end">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="text-text-muted group-hover:text-accent transition-colors"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
