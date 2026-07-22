import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { executionsApi } from '../api/executions';
import { useToast } from '../hooks/useToast';
import { usePolling } from '../hooks/usePolling';
import { formatRelativeTime, formatDateTime, formatDuration } from '../utils/formatters';
import StatusBadge from '../components/StatusBadge';
import InlineAgentChat from '../components/InlineAgentChat';

function StatusBanner({ status }) {
  const styles = {
    running: 'bg-[rgba(245,158,11,0.1)] border-warning/30 text-warning',
    completed: 'bg-[rgba(34,197,94,0.1)] border-success/30 text-success',
    failed: 'bg-[rgba(239,68,68,0.1)] border-danger/30 text-danger',
    cancelled: 'bg-[rgba(156,163,175,0.1)] border-[#9ca3af]/30 text-[#9ca3af]',
  };

  const icons = {
    running: (
      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    ),
    completed: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    failed: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
    cancelled: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    ),
  };

  const labels = {
    running: 'Execution Running',
    completed: 'Execution Completed',
    failed: 'Execution Failed',
    cancelled: 'Execution Cancelled',
  };

  const style = styles[status] || styles.cancelled;

  return (
    <div className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border ${style}`}>
      {icons[status] || icons.cancelled}
      <span className="text-[14px] font-semibold">{labels[status] || status}</span>
    </div>
  );
}

export default function ExecutionDetail() {
  const { id: workplaceId, executionId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [execution, setExecution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedStep, setExpandedStep] = useState(null);

  const isRunning = execution?.status === 'running' || execution?.status === 'pending';

  const fetchExecution = useCallback(async () => {
    try {
      const data = await executionsApi.get(executionId);
      setExecution(data);
    } catch (err) {
      if (loading) addToast('Failed to load execution', 'error');
    } finally {
      setLoading(false);
    }
  }, [executionId]);

  useEffect(() => {
    fetchExecution();
  }, [fetchExecution]);

  usePolling(fetchExecution, 3000, isRunning);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-text-muted">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading execution...
        </div>
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted text-[14px]">Execution not found</p>
        <button
          onClick={() => navigate(`/workplaces/${workplaceId}/history`)}
          className="mt-4 text-accent hover:text-accent-hover text-[13px] bg-transparent border-none cursor-pointer"
        >
          Back to History
        </button>
      </div>
    );
  }

  const stepResults = execution.step_results || execution.results || [];
  const agentDecision = execution.agent_decision || execution.agent_context;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate(`/workplaces/${workplaceId}/history`)}
          className="text-text-muted hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {execution.unit_name || execution.pipeline_name || 'Execution Detail'}
          </h1>
          <p className="text-[11px] text-text-muted font-mono mt-0.5">{execution.id}</p>
        </div>
      </div>

      {/* Status banner */}
      <div className="mb-5">
        <StatusBanner status={execution.status} />
      </div>

      {/* Meta info */}
      <div className="bg-card border border-border rounded-xl p-5 mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Trigger</span>
            <p className="text-[13px] text-text-primary mt-1 capitalize">
              {execution.trigger_type || 'manual'}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Started</span>
            <p className="text-[13px] text-text-primary mt-1">
              {formatDateTime(execution.started_at)}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Finished</span>
            <p className="text-[13px] text-text-primary mt-1">
              {execution.finished_at ? formatDateTime(execution.finished_at) : isRunning ? 'In progress...' : '-'}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Duration</span>
            <p className="text-[13px] text-text-primary mt-1 font-mono">
              {execution.finished_at && execution.started_at
                ? formatDuration(execution.started_at, execution.finished_at)
                : isRunning ? 'Running...' : '-'
              }
            </p>
          </div>
        </div>

        {execution.error && (
          <div className="mt-4 pt-4 border-t border-border">
            <span className="text-[10px] font-semibold text-danger uppercase tracking-wider">Error</span>
            <pre className="text-[12px] text-danger mt-1 font-mono bg-danger-dim rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {execution.error}
            </pre>
          </div>
        )}

        {execution.status === 'failed' && (
          <div className="mt-4 pt-4 border-t border-border">
            <InlineAgentChat
              workplaceId={workplaceId}
              context={`Unit "${execution.unit_name}" failed. ${execution.error || ''} ${
                stepResults.filter(s => s.status === 'failed').map(s => `Step "${s.step_name}" error: ${s.stderr}`).join('. ')
              }`}
              placeholder="Ask AI: Why did this execution fail?"
            />
          </div>
        )}
      </div>

      {/* Agent Decision Card */}
      {agentDecision && (
        <div className="bg-card border border-[#a855f7]/30 rounded-xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
              <path d="M8.24 9.93C6.4 9.58 5 7.95 5 6a4 4 0 0 1 4-4" />
              <path d="M2 17.5A4.5 4.5 0 0 1 6.5 13h11a4.5 4.5 0 0 1 0 9h-11A4.5 4.5 0 0 1 2 17.5z" />
            </svg>
            <span className="text-[13px] font-semibold text-[#a855f7]">Agent Decision</span>
          </div>

          {(agentDecision.response || agentDecision.decision || agentDecision.text) && (
            <p className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap">
              {agentDecision.response || agentDecision.decision || agentDecision.text}
            </p>
          )}

          {(agentDecision.tool_calls || agentDecision.tools_used) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {(agentDecision.tool_calls || agentDecision.tools_used).map((tool, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[rgba(168,85,247,0.1)] border border-[#a855f7]/20 rounded-lg text-[11px] font-medium text-[#a855f7]"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                  {typeof tool === 'string' ? tool : tool.name || tool.tool_name}
                </span>
              ))}
            </div>
          )}

          {agentDecision.reasoning && (
            <div className="mt-3 pt-3 border-t border-[#a855f7]/10">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Reasoning</span>
              <p className="text-[12px] text-text-muted mt-1">{agentDecision.reasoning}</p>
            </div>
          )}
        </div>
      )}

      {/* Step Results */}
      <div className="mb-5">
        <h2 className="text-[14px] font-semibold text-text-primary mb-3">
          Step Results ({stepResults.length})
        </h2>

        {stepResults.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-[13px] text-text-muted text-center py-4">
              {isRunning ? 'Waiting for step results...' : 'No step results available.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {stepResults.map((result, idx) => {
              const isOpen = expandedStep === idx;
              return (
                <div
                  key={result.id || idx}
                  className="bg-card border border-border rounded-xl overflow-hidden"
                >
                  <button
                    className="w-full flex items-center gap-3 px-5 py-3 text-left bg-transparent border-none cursor-pointer"
                    onClick={() => setExpandedStep(isOpen ? null : idx)}
                  >
                    <span className="text-[11px] font-mono text-text-muted bg-elevated w-6 h-6 rounded flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-[13px] font-medium text-text-primary flex-1 truncate">
                      {result.step_name || result.name || `Step ${idx + 1}`}
                    </span>
                    <StatusBadge status={result.status} />
                    {result.duration && (
                      <span className="text-[11px] text-text-muted font-mono flex-shrink-0">
                        {result.duration}
                      </span>
                    )}
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={`text-text-muted transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-4 border-t border-border">
                      <div className="pt-4 flex flex-col gap-3">
                        {result.stdout && (
                          <div>
                            <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                              Output
                            </label>
                            <pre className="bg-[#0d0f17] border border-border rounded-lg p-3 text-[11px] font-mono text-success overflow-auto max-h-[200px] whitespace-pre-wrap leading-relaxed">
                              {result.stdout}
                            </pre>
                          </div>
                        )}

                        {result.stderr && (
                          <div>
                            <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                              Errors
                            </label>
                            <pre className="bg-[#0d0f17] border border-border rounded-lg p-3 text-[11px] font-mono text-danger overflow-auto max-h-[200px] whitespace-pre-wrap leading-relaxed">
                              {result.stderr}
                            </pre>
                          </div>
                        )}

                        {result.return_value && (
                          <div>
                            <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                              Return Value
                            </label>
                            <pre className="bg-[#0d0f17] border border-border rounded-lg p-3 text-[11px] font-mono text-accent overflow-auto max-h-[150px] whitespace-pre-wrap leading-relaxed">
                              {typeof result.return_value === 'string'
                                ? result.return_value
                                : JSON.stringify(result.return_value, null, 2)
                              }
                            </pre>
                          </div>
                        )}

                        {!result.stdout && !result.stderr && !result.return_value && (
                          <p className="text-[12px] text-text-muted py-2">No output recorded for this step.</p>
                        )}

                        {result.status === 'failed' && (
                          <InlineAgentChat
                            workplaceId={workplaceId}
                            context={`Step "${result.step_name}" in unit "${execution.unit_name}" failed.\nStderr: ${result.stderr || 'No error output'}\nStdout: ${result.stdout || 'No output'}`}
                            placeholder={`Ask AI about "${result.step_name}" failure...`}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
