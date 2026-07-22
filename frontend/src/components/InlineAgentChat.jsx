import React, { useState } from 'react';
import { agentApi } from '../api/agent';
import { useToast } from '../hooks/useToast';

/**
 * Inline chat input for asking the agent about errors.
 * Shows a compact input that expands into a mini chat when used.
 *
 * Props:
 *   workplaceId: string
 *   context: string — pre-filled context about the error (e.g., stderr, step name)
 *   placeholder: string — input placeholder text
 */
export default function InlineAgentChat({ workplaceId, context, placeholder }) {
  const { addToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const text = message.trim();
    if (!text || loading) return;

    // Build message with context
    const fullMessage = messages.length === 0 && context
      ? `Context: ${context}\n\nQuestion: ${text}`
      : text;

    setMessages(prev => [...prev, { role: 'user', text }]);
    setMessage('');
    setLoading(true);

    try {
      const result = await agentApi.chat(workplaceId, fullMessage);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: result.response || 'No response',
        actions: result.actions_taken || [],
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Failed to get agent response: ' + err.message,
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 px-3 py-2 mt-3 w-full bg-[rgba(168,85,247,0.08)] border border-[#a855f7]/20 rounded-lg text-[12px] text-[#a855f7] hover:bg-[rgba(168,85,247,0.15)] transition-colors cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {placeholder || 'Ask AI about this error...'}
      </button>
    );
  }

  return (
    <div className="mt-3 border border-[#a855f7]/20 rounded-lg bg-[rgba(168,85,247,0.05)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#a855f7]/10">
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-[11px] font-semibold text-[#a855f7] uppercase tracking-wider">Ask Agent</span>
        </div>
        <button
          onClick={() => { setExpanded(false); setMessages([]); }}
          className="text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer text-xs"
        >
          Close
        </button>
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div className="max-h-[250px] overflow-y-auto p-3 flex flex-col gap-2.5">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-[12px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-accent text-white rounded-br-sm'
                  : msg.error
                    ? 'bg-danger-dim text-danger border border-danger/20 rounded-bl-sm'
                    : 'bg-elevated text-text-primary border border-border rounded-bl-sm'
              }`}>
                <p className="whitespace-pre-wrap">{msg.text}</p>
                {msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-white/10">
                    {msg.actions.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/10 rounded text-[10px]">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                        </svg>
                        {a.tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-elevated border border-border rounded-lg rounded-bl-sm px-3 py-2 text-[12px] text-text-muted flex items-center gap-2">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Thinking...
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 p-2 border-t border-[#a855f7]/10">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={messages.length === 0 ? (placeholder || 'Ask about this error...') : 'Follow up...'}
          className="flex-1 bg-transparent border-none outline-none text-[12px] text-text-primary placeholder-text-muted px-2 py-1.5"
          autoFocus
        />
        <button
          onClick={handleSend}
          disabled={loading || !message.trim()}
          className="px-3 py-1.5 bg-[#a855f7] hover:bg-[#9333ea] text-white rounded-md text-[11px] font-semibold transition-colors cursor-pointer border-none disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
