import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { connectorsApi } from '../api/connectors';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';

const CONNECTOR_TYPES = [
  { value: 's3', label: 'AWS S3', fields: ['bucket', 'region'] },
  { value: 'postgresql', label: 'PostgreSQL', fields: ['connection_string'] },
  { value: 'http_rest', label: 'HTTP/REST API', fields: ['base_url'] },
];

const TYPE_CONFIG_FIELDS = {
  s3: [
    { key: 'bucket', label: 'Bucket Name', placeholder: 'my-data-bucket' },
    { key: 'region', label: 'AWS Region', placeholder: 'us-east-1' },
  ],
  postgresql: [
    { key: 'connection_string', label: 'Connection String', placeholder: 'postgresql://user:pass@host:5432/dbname' },
  ],
  http_rest: [
    { key: 'base_url', label: 'Base URL', placeholder: 'https://api.example.com/v1' },
  ],
};

export default function ConnectorList() {
  const { id: workplaceId } = useParams();
  const { addToast } = useToast();
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingConnector, setEditingConnector] = useState(null);
  const [formData, setFormData] = useState({ name: '', type: 's3', config: {}, credentials: '' });
  const [checkingHealth, setCheckingHealth] = useState(null);

  const fetchConnectors = useCallback(async () => {
    try {
      const data = await connectorsApi.list(workplaceId);
      setConnectors(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [workplaceId]);

  useEffect(() => { fetchConnectors(); }, [fetchConnectors]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingConnector) {
        await connectorsApi.update(workplaceId, editingConnector.id, formData);
        addToast('Connector updated', 'success');
      } else {
        await connectorsApi.create(workplaceId, formData);
        addToast('Connector created', 'success');
      }
      setShowModal(false);
      setEditingConnector(null);
      setFormData({ name: '', type: 's3', config: {}, credentials: '' });
      fetchConnectors();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (connectorId) => {
    if (!confirm('Delete this connector?')) return;
    try {
      await connectorsApi.delete(workplaceId, connectorId);
      addToast('Connector deleted', 'success');
      fetchConnectors();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleHealthCheck = async (connectorId) => {
    setCheckingHealth(connectorId);
    try {
      const result = await connectorsApi.checkHealth(workplaceId, connectorId);
      addToast(`Health: ${result.health_status}`, result.health_status === 'healthy' ? 'success' : 'warning');
      fetchConnectors();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setCheckingHealth(null);
    }
  };

  const openEditModal = (connector) => {
    setEditingConnector(connector);
    setFormData({
      name: connector.name,
      type: connector.type,
      config: connector.config || {},
      credentials: '',
    });
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingConnector(null);
    setFormData({ name: '', type: 's3', config: {}, credentials: '' });
    setShowModal(true);
  };

  const configFields = TYPE_CONFIG_FIELDS[formData.type] || [];

  const healthColor = (status) => {
    if (status === 'healthy') return 'text-green-400';
    if (status === 'degraded') return 'text-yellow-400';
    if (status === 'unreachable') return 'text-red-400';
    return 'text-gray-500';
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Connectors</h1>
        <button onClick={openCreateModal} className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors">
          + New Connector
        </button>
      </div>

      {connectors.length === 0 ? (
        <EmptyState title="No connectors yet" description="Connect external systems like S3, PostgreSQL, or REST APIs." actionLabel="Create Connector" onAction={openCreateModal} />
      ) : (
        <div className="space-y-3">
          {connectors.map((c) => (
            <div key={c.id} className="bg-surface border border-border rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{c.name}</span>
                    <span className="text-xs px-2 py-0.5 bg-surface-hover rounded text-gray-400">{c.type}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span className={healthColor(c.health_status)}>
                      {c.health_status}
                    </span>
                    {c.last_checked && (
                      <span>checked {new Date(c.last_checked).toLocaleString()}</span>
                    )}
                    {c.has_credentials && <span className="text-yellow-600">credentials set</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleHealthCheck(c.id)} disabled={checkingHealth === c.id} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-surface-hover text-gray-400 transition-colors disabled:opacity-50">
                  {checkingHealth === c.id ? 'Checking...' : 'Check Health'}
                </button>
                <button onClick={() => openEditModal(c)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-surface-hover text-gray-400 transition-colors">
                  Edit
                </button>
                <button onClick={() => handleDelete(c.id)} className="px-3 py-1.5 text-xs border border-red-800 rounded hover:bg-red-900/30 text-red-400 transition-colors">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editingConnector ? 'Edit Connector' : 'New Connector'} onClose={() => { setShowModal(false); setEditingConnector(null); }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 bg-primary border border-border rounded text-white text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Type</label>
              <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value, config: {} })} className="w-full px-3 py-2 bg-primary border border-border rounded text-white text-sm" disabled={!!editingConnector}>
                {CONNECTOR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {configFields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm text-gray-400 mb-1">{field.label}</label>
                <input type="text" value={formData.config[field.key] || ''} onChange={(e) => setFormData({ ...formData, config: { ...formData.config, [field.key]: e.target.value } })} placeholder={field.placeholder} className="w-full px-3 py-2 bg-primary border border-border rounded text-white text-sm" />
              </div>
            ))}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Credentials {editingConnector && '(leave blank to keep existing)'}</label>
              <input type="password" value={formData.credentials} onChange={(e) => setFormData({ ...formData, credentials: e.target.value })} placeholder={editingConnector ? '••••••' : 'API key, connection password, or JSON credentials'} className="w-full px-3 py-2 bg-primary border border-border rounded text-white text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setShowModal(false); setEditingConnector(null); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded text-sm font-medium transition-colors">{editingConnector ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
