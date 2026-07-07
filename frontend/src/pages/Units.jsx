import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { unitsApi } from '../api/units';
import { useToast } from '../hooks/useToast';
import { usePolling } from '../hooks/usePolling';
import { formatRelativeTime } from '../utils/formatters';
import StatsBar from '../components/StatsBar';
import FilterBar from '../components/FilterBar';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Units() {
  const { id: workplaceId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);

  const fetchUnits = async () => {
    try {
      const data = await unitsApi.list(workplaceId);
      setUnits(data);
    } catch (err) {
      // ignore polling errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnits();
  }, [workplaceId]);

  usePolling(fetchUnits, 10000);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleRun = async (unitId) => {
    try {
      await unitsApi.run(workplaceId, unitId);
      addToast('Unit started', 'success');
      fetchUnits();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await unitsApi.delete(workplaceId, deleteTarget);
      addToast('Unit deleted', 'success');
      setDeleteTarget(null);
      fetchUnits();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const filtered = units.filter(u => {
    if (search && !u.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== 'all' && u.type !== typeFilter) return false;
    return true;
  });

  const typeCounts = units.reduce((acc, u) => {
    acc[u.type] = (acc[u.type] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-text-muted">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading units...
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-text-primary">Units of Work</h1>
        <button
          onClick={() => navigate(`/workplaces/${workplaceId}/units/new`)}
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
          { label: 'Total', value: units.length, color: '#6366f1' },
          { label: 'Enabled', value: units.filter(u => u.enabled).length, color: '#22c55e' },
          { label: 'Script', value: typeCounts.script || 0 },
          { label: 'HTTP', value: typeCounts.http_request || 0 },
          { label: 'Transform', value: typeCounts.transform || 0 },
        ]}
      />

      {/* Filter */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search units..."
        filters={[
          { label: 'All', value: 'all' },
          { label: 'Script', value: 'script' },
          { label: 'HTTP', value: 'http_request' },
          { label: 'Transform', value: 'transform' },
        ]}
        activeFilter={typeFilter}
        onFilterChange={setTypeFilter}
      />

      {/* Unit list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
            </svg>
          }
          title={search || typeFilter !== 'all' ? 'No matching units' : 'No units yet'}
          description={search || typeFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first unit of work to get started'}
          action={
            !search && typeFilter === 'all' ? (
              <button
                onClick={() => navigate(`/workplaces/${workplaceId}/units/new`)}
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer border-none"
              >
                Create Unit
              </button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(unit => (
            <div
              key={unit.id}
              className="bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4 hover:border-border-light transition-colors group"
            >
              {/* Play button */}
              <button
                onClick={(e) => { e.stopPropagation(); handleRun(unit.id); }}
                className="w-8 h-8 rounded-lg bg-success-dim hover:bg-success/20 flex items-center justify-center flex-shrink-0 border-none cursor-pointer transition-colors"
                title="Run unit"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#22c55e" stroke="none">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </button>

              {/* Info */}
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => navigate(`/workplaces/${workplaceId}/units/${unit.id}`)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[14px] font-semibold text-text-primary group-hover:text-accent transition-colors">
                    {unit.name}
                  </span>
                  <StatusBadge status={unit.type} />
                  <StatusBadge status={unit.mode || 'independent'} />
                  {!unit.enabled && (
                    <StatusBadge status="disabled" />
                  )}
                </div>
                {unit.description && (
                  <p className="text-[12px] text-text-muted truncate">{unit.description}</p>
                )}
              </div>

              {/* Last run */}
              <div className="text-[11px] text-text-muted flex-shrink-0">
                {unit.last_status && (
                  <StatusBadge status={unit.last_status} className="mr-2" />
                )}
                {formatRelativeTime(unit.last_run)}
              </div>

              {/* Menu */}
              <div className="relative" ref={openMenu === unit.id ? menuRef : null}>
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === unit.id ? null : unit.id); }}
                  className="w-7 h-7 rounded-md hover:bg-elevated flex items-center justify-center border-none bg-transparent cursor-pointer text-text-muted hover:text-text-primary transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                  </svg>
                </button>
                {openMenu === unit.id && (
                  <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.4)] z-50 py-1 min-w-[140px]">
                    <button
                      onClick={() => { setOpenMenu(null); navigate(`/workplaces/${workplaceId}/units/${unit.id}`); }}
                      className="w-full px-3 py-2 text-left text-[13px] text-text-secondary hover:bg-elevated hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { setOpenMenu(null); handleRun(unit.id); }}
                      className="w-full px-3 py-2 text-left text-[13px] text-text-secondary hover:bg-elevated hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
                    >
                      Run
                    </button>
                    <hr className="border-border my-1" />
                    <button
                      onClick={() => { setOpenMenu(null); setDeleteTarget(unit.id); }}
                      className="w-full px-3 py-2 text-left text-[13px] text-danger hover:bg-danger-dim transition-colors bg-transparent border-none cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Unit"
        message="Are you sure you want to delete this unit? This action cannot be undone."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
