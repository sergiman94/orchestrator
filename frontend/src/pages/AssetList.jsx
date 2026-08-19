import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { assetsApi } from '../api/assets';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';

const ASSET_TYPES = [
  { value: 'database', label: 'Database' },
  { value: 'api', label: 'API' },
  { value: 'aws_service', label: 'AWS Service' },
  { value: 'storage', label: 'Storage' },
  { value: 'custom', label: 'Custom' },
];

const TYPE_CONFIG_FIELDS = {
  database: [
    { key: 'connection_string', label: 'Connection String', placeholder: 'postgresql://user:pass@host:5432/db' },
  ],
  api: [
    { key: 'url', label: 'URL', placeholder: 'https://api.example.com' },
  ],
  aws_service: [
    { key: 'service', label: 'AWS Service', placeholder: 's3' },
    { key: 'region', label: 'Region', placeholder: 'us-east-1' },
  ],
  storage: [
    { key: 'url', label: 'Storage URL', placeholder: 'https://storage.example.com' },
  ],
  custom: [
    { key: 'url', label: 'Health Check URL', placeholder: 'https://service.example.com/health' },
  ],
};

export default function AssetList() {
  const { id: workplaceId } = useParams();
  const { addToast } = useToast();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ name: '', type: 'database', config: {}, credentials: '', check_interval: 300 });
  const [checkingHealth, setCheckingHealth] = useState(null);

  const fetchAssets = useCallback(async () => {
    try {
      const data = await assetsApi.list(workplaceId);
      setAssets(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [workplaceId]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await assetsApi.update(workplaceId, editing.id, formData);
        addToast('Asset updated', 'success');
      } else {
        await assetsApi.create(workplaceId, formData);
        addToast('Asset created', 'success');
      }
      setShowModal(false);
      setEditing(null);
      setFormData({ name: '', type: 'database', config: {}, credentials: '', check_interval: 300 });
      fetchAssets();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this asset?')) return;
    try {
      await assetsApi.delete(workplaceId, id);
      addToast('Asset deleted', 'success');
      fetchAssets();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleHealthCheck = async (id) => {
    setCheckingHealth(id);
    try {
      const result = await assetsApi.checkHealth(workplaceId, id);
      addToast(`Health: ${result.health_status}${result.changed ? ' (changed)' : ''}`, result.health_status === 'healthy' ? 'success' : 'warning');
      fetchAssets();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setCheckingHealth(null);
    }
  };

  const openEdit = (asset) => {
    setEditing(asset);
    setFormData({ name: asset.name, type: asset.type, config: asset.config || {}, credentials: '', check_interval: asset.check_interval || 300 });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditing(null);
    setFormData({ name: '', type: 'database', config: {}, credentials: '', check_interval: 300 });
    setShowModal(true);
  };

  const configFields = TYPE_CONFIG_FIELDS[formData.type] || [];
  const healthColor = (s) => s === 'healthy' ? 'text-green-400' : s === 'degraded' ? 'text-yellow-400' : s === 'unreachable' ? 'text-red-400' : 'text-gray-500';

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" /></div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Assets</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors">+ New Asset</button>
      </div>

      {assets.length === 0 ? (
        <EmptyState title="No assets yet" description="Register external services to monitor their health." actionLabel="Add Asset" onAction={openCreate} />
      ) : (
        <div className="space-y-3">
          {assets.map((a) => (
            <div key={a.id} className="bg-surface border border-border rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{a.name}</span>
                  <span className="text-xs px-2 py-0.5 bg-surface-hover rounded text-gray-400">{a.type}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className={healthColor(a.health_status)}>{a.health_status}</span>
                  {a.last_checked && <span>checked {new Date(a.last_checked).toLocaleString()}</span>}
                  <span>every {a.check_interval}s</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleHealthCheck(a.id)} disabled={checkingHealth === a.id} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-surface-hover text-gray-400 transition-colors disabled:opacity-50">
                  {checkingHealth === a.id ? 'Checking...' : 'Check Now'}
                </button>
                <button onClick={() => openEdit(a)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-surface-hover text-gray-400 transition-colors">Edit</button>
                <button onClick={() => handleDelete(a.id)} className="px-3 py-1.5 text-xs border border-red-800 rounded hover:bg-red-900/30 text-red-400 transition-colors">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Asset' : 'New Asset'} onClose={() => { setShowModal(false); setEditing(null); }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 bg-primary border border-border rounded text-white text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Type</label>
              <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value, config: {} })} className="w-full px-3 py-2 bg-primary border border-border rounded text-white text-sm" disabled={!!editing}>
                {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {configFields.map((f) => (
              <div key={f.key}>
                <label className="block text-sm text-gray-400 mb-1">{f.label}</label>
                <input type="text" value={formData.config[f.key] || ''} onChange={(e) => setFormData({ ...formData, config: { ...formData.config, [f.key]: e.target.value } })} placeholder={f.placeholder} className="w-full px-3 py-2 bg-primary border border-border rounded text-white text-sm" />
              </div>
            ))}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Credentials {editing && '(leave blank to keep)'}</label>
              <input type="password" value={formData.credentials} onChange={(e) => setFormData({ ...formData, credentials: e.target.value })} placeholder={editing ? '••••••' : 'Password, API key, or JSON credentials'} className="w-full px-3 py-2 bg-primary border border-border rounded text-white text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Check Interval (seconds, 0 to disable)</label>
              <input type="number" value={formData.check_interval} onChange={(e) => setFormData({ ...formData, check_interval: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 bg-primary border border-border rounded text-white text-sm" min="0" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded text-sm font-medium transition-colors">{editing ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
