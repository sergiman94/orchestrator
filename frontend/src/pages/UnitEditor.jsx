import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { unitsApi } from '../api/units';
import { useToast } from '../hooks/useToast';
import CodeEditor from '../components/CodeEditor';
import Modal from '../components/Modal';

const DEFAULT_SCRIPT = `# Unit of Work Script
# Available: INPUT_DATA env var (for chained mode)
# Print to stdout for output, stderr for errors

import json
import os

def main():
    input_data = os.environ.get("INPUT_DATA", "{}")
    print("Hello from Orchestrator!")
    return {"status": "ok"}

if __name__ == "__main__":
    result = main()
    if result:
        print(json.dumps(result))
`;

const DEFAULT_RETRY = {
  max_retries: 0,
  delay: 5,
  backoff_multiplier: 2,
};

export default function UnitEditor() {
  const { id: workplaceId, unitId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const isNew = !unitId;

  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'script',
    script: DEFAULT_SCRIPT,
    config: {},
    timeout: 300,
    retry_policy: { ...DEFAULT_RETRY },
    enabled: true,
    mode: 'independent',
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!isNew) {
      unitsApi.get(workplaceId, unitId)
        .then(data => {
          setForm({
            name: data.name || '',
            description: data.description || '',
            type: data.type || 'script',
            script: data.script || DEFAULT_SCRIPT,
            config: data.config || {},
            timeout: data.timeout ?? 300,
            retry_policy: data.retry_policy || { ...DEFAULT_RETRY },
            enabled: data.enabled ?? true,
            mode: data.mode || 'independent',
          });
          setLoading(false);
        })
        .catch(err => {
          addToast('Failed to load unit: ' + err.message, 'error');
          navigate(`/workplaces/${workplaceId}/units`);
        });
    }
  }, [unitId, workplaceId]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      addToast('Name is required', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
      };

      if (isNew) {
        await unitsApi.create(workplaceId, payload);
        addToast('Unit created', 'success');
      } else {
        await unitsApi.update(workplaceId, unitId, payload);
        addToast('Unit saved', 'success');
      }
      navigate(`/workplaces/${workplaceId}/units`);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!form.name.trim()) {
      addToast('Save the unit first before testing', 'error');
      return;
    }
    if (isNew) {
      addToast('Save the unit first before testing', 'error');
      return;
    }

    setTesting(true);
    try {
      const result = await unitsApi.test(workplaceId, unitId, { script: form.script });
      setTestResult(result);
      setShowTestResult(true);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const updateRetry = (key, value) => {
    setForm(prev => ({
      ...prev,
      retry_policy: { ...prev.retry_policy, [key]: value },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-text-muted">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading unit...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/workplaces/${workplaceId}/units`)}
            className="text-text-muted hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-text-primary">
            {isNew ? 'Create Unit' : 'Edit Unit'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2 bg-elevated border border-border rounded-lg text-[13px] font-medium text-text-primary hover:bg-card transition-colors cursor-pointer disabled:opacity-50"
            >
              {testing ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Testing...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Test Run
                </>
              )}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer border-none disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Unit'}
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-5">
        {/* Name + Description */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
                placeholder="My Unit"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
                placeholder="What does this unit do?"
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Type + Mode */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                Type
              </label>
              <div className="flex gap-2">
                {['script', 'http_request', 'transform'].map(t => (
                  <button
                    key={t}
                    onClick={() => setForm({ ...form, type: t })}
                    className={`flex-1 px-3 py-2 rounded-lg text-[13px] font-medium border transition-all cursor-pointer ${
                      form.type === t
                        ? 'bg-accent-dim border-accent text-accent'
                        : 'bg-elevated border-border text-text-secondary hover:text-text-primary hover:border-border-light'
                    } ${t !== 'script' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={t !== 'script'}
                    title={t !== 'script' ? 'Coming soon - only script type available in MVP' : ''}
                  >
                    {t === 'script' ? 'Script' : t === 'http_request' ? 'HTTP' : 'Transform'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                Mode
              </label>
              <div className="flex gap-2">
                {['independent', 'chained'].map(m => (
                  <button
                    key={m}
                    onClick={() => setForm({ ...form, mode: m })}
                    className={`flex-1 px-3 py-2 rounded-lg text-[13px] font-medium border transition-all cursor-pointer ${
                      form.mode === m
                        ? 'bg-accent-dim border-accent text-accent'
                        : 'bg-elevated border-border text-text-secondary hover:text-text-primary hover:border-border-light'
                    }`}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Script Editor */}
        {form.type === 'script' && (
          <div className="bg-card border border-border rounded-xl p-5">
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Python Script
            </label>
            <CodeEditor
              value={form.script}
              onChange={(val) => setForm({ ...form, script: val })}
              minHeight="300px"
            />
          </div>
        )}

        {/* Settings */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-[13px] font-semibold text-text-primary mb-4">Settings</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                Timeout (sec)
              </label>
              <input
                type="number"
                value={form.timeout}
                onChange={(e) => setForm({ ...form, timeout: parseInt(e.target.value) || 300 })}
                className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                min={1}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                Max Retries
              </label>
              <input
                type="number"
                value={form.retry_policy.max_retries}
                onChange={(e) => updateRetry('max_retries', parseInt(e.target.value) || 0)}
                className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                min={0}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                Retry Delay (sec)
              </label>
              <input
                type="number"
                value={form.retry_policy.delay}
                onChange={(e) => updateRetry('delay', parseInt(e.target.value) || 5)}
                className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                min={1}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                Backoff Mult
              </label>
              <input
                type="number"
                value={form.retry_policy.backoff_multiplier}
                onChange={(e) => updateRetry('backoff_multiplier', parseFloat(e.target.value) || 1)}
                className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                min={1}
                step={0.5}
              />
            </div>
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border">
            <button
              onClick={() => setForm({ ...form, enabled: !form.enabled })}
              className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer border-none ${
                form.enabled ? 'bg-accent' : 'bg-border'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  form.enabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
            <span className="text-[13px] text-text-secondary">
              {form.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>

      {/* Test Result Modal */}
      <Modal
        open={showTestResult}
        onClose={() => setShowTestResult(false)}
        title="Test Run Result"
        maxWidth="max-w-[700px]"
      >
        {testResult && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[13px] font-medium text-text-secondary">Status:</span>
              <span className={`text-[13px] font-bold ${testResult.status === 'completed' ? 'text-success' : 'text-danger'}`}>
                {testResult.status}
              </span>
              {testResult.duration && (
                <span className="text-[12px] text-text-muted ml-2">({testResult.duration})</span>
              )}
            </div>

            {testResult.stdout && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                  Output
                </label>
                <pre className="bg-[#0d0f17] border border-border rounded-lg p-4 text-[12px] font-mono text-success overflow-auto max-h-[200px] whitespace-pre-wrap">
                  {testResult.stdout}
                </pre>
              </div>
            )}

            {testResult.stderr && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                  Errors
                </label>
                <pre className="bg-[#0d0f17] border border-border rounded-lg p-4 text-[12px] font-mono text-danger overflow-auto max-h-[200px] whitespace-pre-wrap">
                  {testResult.stderr}
                </pre>
              </div>
            )}

            {testResult.return_value && (
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                  Return Value
                </label>
                <pre className="bg-[#0d0f17] border border-border rounded-lg p-4 text-[12px] font-mono text-accent overflow-auto max-h-[200px] whitespace-pre-wrap">
                  {testResult.return_value}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
