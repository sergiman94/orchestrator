import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { workplacesApi } from '../api/workplaces';
import { useToast } from '../hooks/useToast';
import { usePolling } from '../hooks/usePolling';
import { formatRelativeTime } from '../utils/formatters';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';

export default function Workplaces() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [workplaces, setWorkplaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);

  const fetchWorkplaces = async () => {
    try {
      const data = await workplacesApi.list();
      setWorkplaces(data);
    } catch (err) {
      // ignore polling errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkplaces();
  }, []);

  usePolling(fetchWorkplaces, 15000);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      addToast('Name is required', 'error');
      return;
    }

    setCreating(true);
    try {
      const wp = await workplacesApi.create({
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        status: 'active',
      });
      addToast('Workplace created', 'success');
      setShowCreate(false);
      setCreateForm({ name: '', description: '' });
      fetchWorkplaces();
      navigate(`/workplaces/${wp.id}`);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setCreating(false);
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
          Loading workplaces...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Workplaces</h1>
          <p className="text-sm text-text-muted mt-1">Manage your orchestration workspaces</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer border-none"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Workplace
        </button>
      </div>

      {/* Grid */}
      {workplaces.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
          }
          title="No workplaces yet"
          description="Create your first workplace to start orchestrating tasks with AI"
          action={
            <button
              onClick={() => setShowCreate(true)}
              className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer border-none"
            >
              Create Workplace
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workplaces.map(wp => (
            <div
              key={wp.id}
              onClick={() => navigate(`/workplaces/${wp.id}`)}
              className="bg-card border border-border rounded-xl p-5 cursor-pointer hover:border-border-light hover:bg-elevated/50 transition-all duration-200 group"
            >
              {/* Top row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-accent-dim flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold text-text-primary group-hover:text-accent transition-colors">
                      {wp.name}
                    </h3>
                  </div>
                </div>
                <StatusBadge status={wp.status || 'active'} />
              </div>

              {/* Description */}
              {wp.description && (
                <p className="text-[12px] text-text-muted mb-4 line-clamp-2 leading-relaxed">
                  {wp.description}
                </p>
              )}

              {/* Footer stats */}
              <div className="flex items-center gap-4 pt-3 border-t border-border/50 text-[11px] text-text-muted">
                <div className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
                  </svg>
                  {wp.unit_count ?? 0} units
                </div>
                <div className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  {formatRelativeTime(wp.last_execution)}
                </div>
              </div>
            </div>
          ))}

          {/* Create card */}
          <div
            onClick={() => setShowCreate(true)}
            className="border-2 border-dashed border-border rounded-xl p-5 cursor-pointer hover:border-accent/40 hover:bg-accent-dim/20 transition-all duration-200 flex items-center justify-center min-h-[160px]"
          >
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-accent-dim flex items-center justify-center mx-auto mb-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <span className="text-[13px] font-medium text-text-muted">New Workplace</span>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Workplace" maxWidth="max-w-[500px]">
        <form onSubmit={handleCreate}>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              Name
            </label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              className="w-full bg-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
              placeholder="My Workspace"
              autoFocus
            />
          </div>
          <div className="mb-6">
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              Description
            </label>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              className="w-full bg-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
              placeholder="What will this workspace do?"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 bg-elevated border border-border rounded-sm text-[13px] font-medium text-text-primary hover:bg-card transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-accent border border-accent text-white rounded-sm text-[13px] font-semibold hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Workplace'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
