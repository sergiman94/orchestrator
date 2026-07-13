import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { memoryApi } from '../api/memory';
import { useToast } from '../hooks/useToast';
import { formatRelativeTime } from '../utils/formatters';
import StatsBar from '../components/StatsBar';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';

const SOURCE_TYPES = [
  { key: 'all', label: 'All', color: null },
  { key: 'execution', label: 'Execution', color: '#22c55e', border: 'border-l-green-500' },
  { key: 'agent_decision', label: 'Agent Decision', color: '#a855f7', border: 'border-l-purple-500' },
  { key: 'user_input', label: 'User Input', color: '#3b82f6', border: 'border-l-blue-500' },
  { key: 'observation', label: 'Observation', color: '#f59e0b', border: 'border-l-yellow-500' },
  { key: 'error_pattern', label: 'Error Pattern', color: '#ef4444', border: 'border-l-red-500' },
];

function getSourceColor(sourceType) {
  const found = SOURCE_TYPES.find(s => s.key === sourceType);
  return found?.color || '#6b7280';
}

function getSourceBorderClass(sourceType) {
  switch (sourceType) {
    case 'execution': return 'border-l-[#22c55e]';
    case 'agent_decision': return 'border-l-[#a855f7]';
    case 'user_input': return 'border-l-[#3b82f6]';
    case 'observation': return 'border-l-[#f59e0b]';
    case 'error_pattern': return 'border-l-[#ef4444]';
    default: return 'border-l-[#6b7280]';
  }
}

function getSourceBadgeClass(sourceType) {
  switch (sourceType) {
    case 'execution': return 'bg-[rgba(34,197,94,0.15)] text-[#22c55e]';
    case 'agent_decision': return 'bg-[rgba(168,85,247,0.15)] text-[#a855f7]';
    case 'user_input': return 'bg-[rgba(59,130,246,0.15)] text-[#3b82f6]';
    case 'observation': return 'bg-[rgba(245,158,11,0.15)] text-[#f59e0b]';
    case 'error_pattern': return 'bg-[rgba(239,68,68,0.15)] text-[#ef4444]';
    default: return 'bg-elevated text-text-muted';
  }
}

export default function MemoryBrowser() {
  const { id: workplaceId } = useParams();
  const { addToast } = useToast();

  const [memories, setMemories] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  // Add memory modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMemory, setNewMemory] = useState({
    content: '',
    source_type: 'observation',
    metadata: {},
  });
  const [addingMemory, setAddingMemory] = useState(false);

  const fetchMemories = useCallback(async () => {
    try {
      const params = {};
      if (filter !== 'all') params.source_type = filter;
      const data = await memoryApi.list(workplaceId, params);
      setMemories(Array.isArray(data) ? data : data.entries || data.memories || []);
    } catch (err) {
      if (loading) addToast('Failed to load memories', 'error');
    } finally {
      setLoading(false);
    }
  }, [workplaceId, filter]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await memoryApi.getStats(workplaceId);
      setStats(data);
    } catch {
      // Stats endpoint may not exist yet
    }
  }, [workplaceId]);

  useEffect(() => {
    fetchMemories();
    fetchStats();
  }, [fetchMemories, fetchStats]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchMemories();
      return;
    }
    setSearching(true);
    try {
      const data = await memoryApi.search(workplaceId, searchQuery.trim());
      setMemories(Array.isArray(data) ? data : data.results || data.entries || data.memories || []);
    } catch (err) {
      addToast('Search failed: ' + err.message, 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    fetchMemories();
  };

  const handleDelete = async (memoryId) => {
    try {
      await memoryApi.delete(workplaceId, memoryId);
      setMemories(prev => prev.filter(m => (m.id || m.memory_id) !== memoryId));
      addToast('Memory deleted', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleAddMemory = async () => {
    if (!newMemory.content.trim()) {
      addToast('Content is required', 'error');
      return;
    }
    setAddingMemory(true);
    try {
      await memoryApi.create(workplaceId, {
        content: newMemory.content.trim(),
        source_type: newMemory.source_type,
        metadata: newMemory.metadata,
      });
      addToast('Memory added', 'success');
      setShowAddModal(false);
      setNewMemory({ content: '', source_type: 'observation', metadata: {} });
      fetchMemories();
      fetchStats();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setAddingMemory(false);
    }
  };

  const totalEntries = stats?.total || memories.length;
  const bySource = stats?.by_source_type || stats?.by_source || {};

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-text-muted">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading memories...
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
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-text-primary">Shared Memory</h1>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer border-none"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Memory
        </button>
      </div>

      {/* Stats bar */}
      <StatsBar
        items={[
          { label: 'Total', value: totalEntries, color: '#6366f1' },
          ...SOURCE_TYPES.filter(s => s.key !== 'all' && (bySource[s.key] || 0) > 0).map(s => ({
            label: s.label,
            value: bySource[s.key] || 0,
            color: s.color,
          })),
        ]}
      />

      {/* Search bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
          >
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search memories..."
            className="w-full bg-elevated border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          disabled={searching}
          className="flex items-center gap-2 px-4 py-2.5 bg-elevated border border-border rounded-lg text-[13px] font-medium text-text-primary hover:bg-card transition-colors cursor-pointer disabled:opacity-50"
        >
          {searching ? (
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            'Search'
          )}
        </button>
      </div>

      {/* Filter toggles */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {SOURCE_TYPES.map(st => (
          <button
            key={st.key}
            onClick={() => {
              setFilter(st.key);
              setSearchQuery('');
            }}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer border ${
              filter === st.key
                ? 'bg-accent-dim border-accent text-accent'
                : 'bg-elevated border-border text-text-secondary hover:text-text-primary hover:border-border-light'
            }`}
          >
            {st.key !== 'all' && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                style={{ backgroundColor: st.color }}
              />
            )}
            {st.label}
          </button>
        ))}
      </div>

      {/* Memory entries */}
      {memories.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          }
          title={searchQuery ? 'No matching memories' : 'No memories yet'}
          description={searchQuery
            ? 'Try a different search query or clear your filters.'
            : 'Memories are automatically collected from executions, agent decisions, and user input. You can also add them manually.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {memories.map((entry) => {
            const entryId = entry.id || entry.memory_id;
            const sourceType = entry.source_type || entry.type || 'observation';
            const isExpanded = expandedId === entryId;
            const content = entry.content || entry.text || '';
            const metadata = entry.metadata || {};

            return (
              <div
                key={entryId}
                className={`bg-card border border-border rounded-xl border-l-[3px] ${getSourceBorderClass(sourceType)} transition-all hover:border-border-light group`}
              >
                <div
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : entryId)}
                >
                  {/* Source badge */}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider flex-shrink-0 mt-0.5 ${getSourceBadgeClass(sourceType)}`}>
                    {sourceType.replace('_', ' ')}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] text-text-primary leading-relaxed ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                      {content}
                    </p>

                    {/* Metadata tags */}
                    {Object.keys(metadata).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Object.entries(metadata).slice(0, isExpanded ? undefined : 3).map(([key, value]) => (
                          <span
                            key={key}
                            className="inline-flex items-center px-1.5 py-0.5 bg-elevated rounded text-[10px] text-text-muted font-mono"
                          >
                            {key}: {typeof value === 'string' ? value : JSON.stringify(value)}
                          </span>
                        ))}
                        {!isExpanded && Object.keys(metadata).length > 3 && (
                          <span className="text-[10px] text-text-muted">
                            +{Object.keys(metadata).length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Relevance score (from search) */}
                  {entry.score != null && (
                    <span className="text-[10px] font-mono text-accent bg-accent-dim px-1.5 py-0.5 rounded flex-shrink-0">
                      {(entry.score * 100).toFixed(0)}%
                    </span>
                  )}

                  {/* Timestamp */}
                  <span className="text-[11px] text-text-muted flex-shrink-0 whitespace-nowrap">
                    {formatRelativeTime(entry.created_at || entry.timestamp)}
                  </span>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(entryId);
                    }}
                    className="text-text-muted hover:text-danger transition-colors bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 flex-shrink-0"
                    title="Delete memory"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14H7L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Memory Modal */}
      <Modal
        open={showAddModal}
        onClose={() => { setShowAddModal(false); setNewMemory({ content: '', source_type: 'observation', metadata: {} }); }}
        title="Add Memory"
        maxWidth="max-w-[500px]"
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              Source Type
            </label>
            <div className="flex flex-wrap gap-2">
              {SOURCE_TYPES.filter(s => s.key !== 'all').map(st => (
                <button
                  key={st.key}
                  onClick={() => setNewMemory({ ...newMemory, source_type: st.key })}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all cursor-pointer ${
                    newMemory.source_type === st.key
                      ? 'bg-accent-dim border-accent text-accent'
                      : 'bg-elevated border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                    style={{ backgroundColor: st.color }}
                  />
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              Content
            </label>
            <textarea
              value={newMemory.content}
              onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
              className="w-full bg-elevated border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
              placeholder="Enter the memory content..."
              rows={5}
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => { setShowAddModal(false); setNewMemory({ content: '', source_type: 'observation', metadata: {} }); }}
              className="px-4 py-2 text-[13px] text-text-secondary bg-elevated border border-border rounded-lg hover:bg-card transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleAddMemory}
              disabled={addingMemory || !newMemory.content.trim()}
              className="px-4 py-2 text-[13px] font-semibold text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors cursor-pointer border-none disabled:opacity-50"
            >
              {addingMemory ? 'Adding...' : 'Add Memory'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
