import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { agentApi } from '../api/agent';
import { useToast } from '../hooks/useToast';
import { usePolling } from '../hooks/usePolling';
import { formatRelativeTime } from '../utils/formatters';

const TABS = ['chat', 'config', 'history'];

export default function AgentPanel() {
  const { id: workplaceId } = useParams();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('chat');
  const [loading, setLoading] = useState(true);

  // Config state
  const [config, setConfig] = useState(null);
  const [configForm, setConfigForm] = useState({
    name: '',
    model: '',
    system_prompt: '',
    temperature: 0.7,
    enabled: false,
  });
  const [savingConfig, setSavingConfig] = useState(false);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // History state
  const [history, setHistory] = useState([]);
  const [expandedDecision, setExpandedDecision] = useState(null);

  // Load config
  const fetchConfig = useCallback(async () => {
    try {
      const data = await agentApi.getConfig(workplaceId);
      setConfig(data);
      setConfigForm({
        name: data.name || '',
        model: data.model || 'claude-sonnet-4-20250514',
        system_prompt: data.system_prompt || '',
        temperature: data.temperature ?? 0.7,
        enabled: data.enabled ?? false,
      });
    } catch (err) {
      // Agent may not exist yet, that's fine
      if (loading) {
        setConfig(null);
      }
    } finally {
      setLoading(false);
    }
  }, [workplaceId]);

  // Load history
  const fetchHistory = useCallback(async () => {
    try {
      const data = await agentApi.getHistory(workplaceId);
      setHistory(Array.isArray(data) ? data : data.decisions || data.history || []);
    } catch {
      // Ignore
    }
  }, [workplaceId]);

  useEffect(() => {
    fetchConfig();
    fetchHistory();
  }, [fetchConfig, fetchHistory]);

  usePolling(fetchHistory, 15000, activeTab === 'history');

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const data = await agentApi.updateConfig(workplaceId, configForm);
      setConfig(data);
      addToast('Agent configuration saved', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || sending) return;

    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setSending(true);

    try {
      const response = await agentApi.chat(workplaceId, text);
      const agentMsg = {
        role: 'assistant',
        content: response.response || response.message || response.text || JSON.stringify(response),
        tool_calls: response.tool_calls || response.tools_used || [],
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, agentMsg]);
    } catch (err) {
      const errorMsg = {
        role: 'assistant',
        content: `Error: ${err.message}`,
        error: true,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-text-muted">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading agent...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent-dim flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
              <path d="M8.24 9.93C6.4 9.58 5 7.95 5 6a4 4 0 0 1 4-4" />
              <path d="M2 17.5A4.5 4.5 0 0 1 6.5 13h11a4.5 4.5 0 0 1 0 9h-11A4.5 4.5 0 0 1 2 17.5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              {configForm.name || 'AI Agent'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${config?.enabled ? 'text-success' : 'text-text-muted'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${config?.enabled ? 'bg-success shadow-[0_0_6px_#22c55e]' : 'bg-text-muted'}`} />
                {config?.enabled ? 'Active' : 'Inactive'}
              </span>
              {configForm.model && (
                <span className="text-[11px] text-text-muted/60 ml-1">{configForm.model}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 flex-shrink-0 border-b border-border pb-0">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[13px] font-medium transition-all cursor-pointer border-none bg-transparent capitalize -mb-px ${
              activeTab === tab
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'config' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl flex flex-col gap-5">
            {/* Agent Name + Model */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    value={configForm.name}
                    onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
                    className="w-full bg-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
                    placeholder="My Agent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    Model
                  </label>
                  <div className="w-full bg-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-text-muted">
                    {configForm.model || 'claude-sonnet-4-20250514'}
                  </div>
                </div>
              </div>
            </div>

            {/* System Prompt */}
            <div className="bg-card border border-border rounded-xl p-5">
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                System Prompt
              </label>
              <textarea
                value={configForm.system_prompt}
                onChange={(e) => setConfigForm({ ...configForm, system_prompt: e.target.value })}
                className="w-full bg-elevated border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors resize-none font-mono leading-relaxed"
                placeholder="You are an AI agent that supervises this workspace..."
                rows={8}
              />
              <p className="text-[11px] text-text-muted mt-2">
                Defines the agent's behavior, personality, and decision-making guidelines.
              </p>
            </div>

            {/* Temperature + Enabled */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-[13px] font-semibold text-text-primary mb-4">Parameters</h3>
              <div className="flex flex-col gap-5">
                {/* Temperature slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Temperature
                    </label>
                    <span className="text-[13px] font-mono text-accent font-bold">
                      {configForm.temperature.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={configForm.temperature}
                    onChange={(e) => setConfigForm({ ...configForm, temperature: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-accent"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted mt-1">
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </div>

                {/* Enabled toggle */}
                <div className="flex items-center gap-3 pt-3 border-t border-border">
                  <button
                    onClick={() => setConfigForm({ ...configForm, enabled: !configForm.enabled })}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer border-none ${
                      configForm.enabled ? 'bg-accent' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        configForm.enabled ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                  <div>
                    <span className="text-[13px] text-text-primary font-medium">
                      {configForm.enabled ? 'Agent Enabled' : 'Agent Disabled'}
                    </span>
                    <p className="text-[11px] text-text-muted">
                      {configForm.enabled
                        ? 'Agent will respond to events and can be invoked'
                        : 'Agent is paused and will not respond to events'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Save button */}
            <div className="flex justify-end">
              <button
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-2.5 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer border-none disabled:opacity-50"
              >
                {savingConfig ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto pb-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                <div className="w-16 h-16 rounded-full border-2 border-border flex items-center justify-center mb-4 animate-float">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3 className="text-[15px] font-semibold text-text-secondary mb-1">Chat with your Agent</h3>
                <p className="text-[13px] max-w-[320px] text-center">
                  Ask questions, request actions, or give instructions. The agent can execute units, query memory, and manage your workspace.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-accent text-white rounded-br-sm'
                      : msg.error
                        ? 'bg-danger-dim border border-danger/30 text-danger rounded-bl-sm'
                        : 'bg-elevated border border-border text-text-primary rounded-bl-sm'
                  }`}
                >
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                    {msg.content}
                  </p>

                  {/* Tool calls */}
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-2">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                        Tools Used
                      </span>
                      {msg.tool_calls.map((tool, ti) => (
                        <div
                          key={ti}
                          className="bg-black/20 border border-white/5 rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent flex-shrink-0">
                              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                            </svg>
                            <span className="text-[12px] font-semibold text-accent">
                              {tool.name || tool.tool_name || 'tool'}
                            </span>
                          </div>
                          {(tool.input || tool.params || tool.arguments) && (
                            <pre className="text-[10px] text-text-muted mt-1.5 font-mono overflow-x-auto">
                              {JSON.stringify(tool.input || tool.params || tool.arguments, null, 2)}
                            </pre>
                          )}
                          {tool.result && (
                            <div className="mt-1.5 text-[10px] text-success font-mono truncate">
                              {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] mt-2 opacity-50">
                    {formatRelativeTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-elevated border border-border rounded-xl rounded-bl-sm px-4 py-3">
                  <div className="flex items-center gap-2 text-text-muted text-[13px]">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    Agent is thinking...
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendMessage} className="flex-shrink-0 border-t border-border pt-4">
            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={config?.enabled ? 'Send a message to the agent...' : 'Enable the agent to start chatting...'}
                disabled={sending || !config?.enabled}
                className="flex-1 bg-elevated border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
                autoFocus
              />
              <button
                type="submit"
                disabled={sending || !chatInput.trim() || !config?.enabled}
                className="flex items-center justify-center w-10 h-10 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors cursor-pointer border-none disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="flex-1 overflow-y-auto">
          {history.length === 0 ? (
            <div className="text-center py-16 text-text-muted">
              <div className="w-16 h-16 rounded-full border-2 border-border flex items-center justify-center mx-auto mb-4 animate-float">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3 className="text-[15px] font-semibold text-text-secondary mb-1">No Decision History</h3>
              <p className="text-[13px] max-w-[300px] mx-auto">
                Agent decisions will appear here as the agent responds to events and takes actions.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((decision, i) => (
                <div
                  key={decision.id || i}
                  className="bg-card border border-border rounded-xl overflow-hidden hover:border-border-light transition-colors"
                >
                  <button
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left bg-transparent border-none cursor-pointer"
                    onClick={() => setExpandedDecision(expandedDecision === i ? null : i)}
                  >
                    {/* Status dot */}
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      decision.outcome === 'success' || decision.status === 'completed'
                        ? 'bg-success shadow-[0_0_6px_#22c55e]'
                        : decision.outcome === 'error' || decision.status === 'failed'
                          ? 'bg-danger shadow-[0_0_6px_#ef4444]'
                          : 'bg-warning shadow-[0_0_6px_#f59e0b]'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-text-primary truncate">
                        {decision.trigger || decision.event_type || decision.action || 'Agent Decision'}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5 truncate">
                        {decision.summary || decision.response?.substring(0, 100) || 'No summary'}
                      </p>
                    </div>

                    {/* Tool count badge */}
                    {(decision.tool_calls?.length > 0 || decision.tools_used?.length > 0) && (
                      <span className="px-2 py-0.5 bg-accent-dim text-accent text-[10px] font-semibold rounded-full flex-shrink-0">
                        {decision.tool_calls?.length || decision.tools_used?.length} tool{(decision.tool_calls?.length || decision.tools_used?.length) > 1 ? 's' : ''}
                      </span>
                    )}

                    <span className="text-[11px] text-text-muted flex-shrink-0">
                      {formatRelativeTime(decision.timestamp || decision.created_at)}
                    </span>

                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={`text-text-muted transition-transform flex-shrink-0 ${expandedDecision === i ? 'rotate-180' : ''}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {expandedDecision === i && (
                    <div className="px-5 pb-4 border-t border-border">
                      <div className="pt-4 flex flex-col gap-3">
                        {/* Trigger */}
                        {(decision.trigger || decision.event_type) && (
                          <div>
                            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Trigger</span>
                            <p className="text-[13px] text-text-primary mt-1">{decision.trigger || decision.event_type}</p>
                          </div>
                        )}

                        {/* Decision / Response */}
                        {(decision.response || decision.decision) && (
                          <div>
                            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Decision</span>
                            <p className="text-[13px] text-text-secondary mt-1 whitespace-pre-wrap">
                              {decision.response || decision.decision}
                            </p>
                          </div>
                        )}

                        {/* Tool calls */}
                        {(decision.tool_calls || decision.tools_used) && (decision.tool_calls || decision.tools_used).length > 0 && (
                          <div>
                            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Tools Used</span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {(decision.tool_calls || decision.tools_used).map((tool, ti) => (
                                <span
                                  key={ti}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-elevated border border-border rounded-lg text-[11px] font-medium text-text-secondary"
                                >
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                                  </svg>
                                  {tool.name || tool.tool_name || tool}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Outcome */}
                        {(decision.outcome || decision.result) && (
                          <div>
                            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Outcome</span>
                            <p className="text-[13px] text-text-secondary mt-1">
                              {typeof (decision.outcome || decision.result) === 'string'
                                ? (decision.outcome || decision.result)
                                : JSON.stringify(decision.outcome || decision.result)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
