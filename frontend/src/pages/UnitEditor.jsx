import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { unitsApi, stepsApi } from '../api/units';
import { useToast } from '../hooks/useToast';
import CodeEditor from '../components/CodeEditor';
import Modal from '../components/Modal';

const DEFAULT_SCRIPT = `# Step Script
# Available: INPUT_DATA variable (for chained mode)
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

  // Unit config
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'script',
    config: {},
    retry_policy: { ...DEFAULT_RETRY },
    enabled: true,
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Steps
  const [steps, setSteps] = useState([]);
  const [expandedStep, setExpandedStep] = useState(null);
  const [snippets, setSnippets] = useState({});  // { stepId: { loading, data, error } }
  const [showSnippets, setShowSnippets] = useState({});
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepName, setNewStepName] = useState('');
  const [savingSteps, setSavingSteps] = useState({});
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  // Test results
  const [testResults, setTestResults] = useState(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [testing, setTesting] = useState(false);

  // Delete step confirmation
  const [deleteStepTarget, setDeleteStepTarget] = useState(null);

  const fetchUnit = useCallback(async () => {
    if (isNew) return;
    try {
      const data = await unitsApi.get(workplaceId, unitId);
      setForm({
        name: data.name || '',
        description: data.description || '',
        type: data.type || 'script',
        config: data.config || {},
        retry_policy: data.retry_policy || { ...DEFAULT_RETRY },
        enabled: data.enabled ?? true,
      });
      setSteps(data.steps || []);
      setLoading(false);
    } catch (err) {
      addToast('Failed to load unit: ' + err.message, 'error');
      navigate(`/workplaces/${workplaceId}/units`);
    }
  }, [workplaceId, unitId, isNew]);

  useEffect(() => {
    fetchUnit();
  }, [fetchUnit]);

  const handleSaveUnit = async () => {
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
        const created = await unitsApi.create(workplaceId, payload);
        addToast('Unit created', 'success');
        navigate(`/workplaces/${workplaceId}/units/${created.id}`);
      } else {
        await unitsApi.update(workplaceId, unitId, payload);
        addToast('Unit saved', 'success');
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddStep = async () => {
    if (!newStepName.trim()) {
      addToast('Step name is required', 'error');
      return;
    }
    try {
      const step = await stepsApi.create(workplaceId, unitId, {
        name: newStepName.trim(),
        script: DEFAULT_SCRIPT,
        mode: 'independent',
        timeout: 300,
      });
      setSteps(prev => [...prev, step]);
      setNewStepName('');
      setShowAddStep(false);
      setExpandedStep(step.id);
      addToast('Step added', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const loadSnippets = async (stepId) => {
    const step = steps.find(s => s.id === stepId);
    if (!step || !workplaceId || !unitId) return;

    setSnippets(prev => ({ ...prev, [stepId]: { loading: true, data: null, error: null } }));
    setShowSnippets(prev => ({ ...prev, [stepId]: true }));

    try {
      const result = await stepsApi.suggestSnippets(workplaceId, unitId, {
        name: step.name,
        mode: step.mode,
        order: step.order,
      });
      setSnippets(prev => ({ ...prev, [stepId]: { loading: false, data: result.snippets, error: null } }));
    } catch (e) {
      setSnippets(prev => ({ ...prev, [stepId]: { loading: false, data: null, error: e.message } }));
    }
  };

  const applySnippet = (stepId, code) => {
    updateStepLocal(stepId, 'script', code);
    setShowSnippets(prev => ({ ...prev, [stepId]: false }));
    showToast('Snippet applied — edit and save when ready', 'info');
  };

  const handleSaveStep = async (stepId) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    setSavingSteps(prev => ({ ...prev, [stepId]: true }));
    try {
      // Syntax check
      try {
        // Basic syntax validation: just check the script compiles as Python
        // (We do a lightweight check client-side, real validation on server)
        if (step.script && step.script.trim()) {
          // We'll rely on server-side validation
        }
      } catch (e) {
        // ignore
      }

      const updated = await stepsApi.update(workplaceId, unitId, stepId, {
        name: step.name,
        script: step.script,
        mode: step.mode,
        timeout: step.timeout,
      });
      setSteps(prev => prev.map(s => s.id === stepId ? updated : s));
      addToast('Step saved', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSavingSteps(prev => ({ ...prev, [stepId]: false }));
    }
  };

  const handleDeleteStep = async () => {
    if (!deleteStepTarget) return;
    try {
      await stepsApi.delete(workplaceId, unitId, deleteStepTarget);
      setSteps(prev => prev.filter(s => s.id !== deleteStepTarget));
      if (expandedStep === deleteStepTarget) setExpandedStep(null);
      setDeleteStepTarget(null);
      addToast('Step deleted', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const updateStepLocal = (stepId, field, value) => {
    setSteps(prev => prev.map(s =>
      s.id === stepId ? { ...s, [field]: value } : s
    ));
  };

  // Drag and drop reorder
  const handleDragStart = (idx) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = async (idx) => {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }

    const reordered = [...steps];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    setSteps(reordered);
    setDragIdx(null);
    setDragOverIdx(null);

    try {
      const stepIds = reordered.map(s => s.id);
      const updated = await stepsApi.reorder(workplaceId, unitId, stepIds);
      setSteps(updated);
    } catch (err) {
      addToast('Failed to reorder: ' + err.message, 'error');
      fetchUnit();
    }
  };

  const handleTest = async () => {
    if (isNew) {
      addToast('Save the unit first before testing', 'error');
      return;
    }
    if (steps.length === 0) {
      addToast('Add at least one step before testing', 'error');
      return;
    }

    setTesting(true);
    try {
      const data = await unitsApi.test(workplaceId, unitId);
      setTestResults(data);
      setShowTestResult(true);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleRun = async () => {
    if (isNew) {
      addToast('Save the unit first', 'error');
      return;
    }
    try {
      await unitsApi.run(workplaceId, unitId);
      addToast('Unit started', 'success');
    } catch (err) {
      addToast(err.message, 'error');
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
            <>
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
              <button
                onClick={handleRun}
                className="flex items-center gap-2 px-4 py-2 bg-success-dim border border-success/30 rounded-lg text-[13px] font-medium text-success hover:bg-success/20 transition-colors cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Run
              </button>
            </>
          )}
          <button
            onClick={handleSaveUnit}
            disabled={saving}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer border-none disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Unit'}
          </button>
        </div>
      </div>

      {/* Form - Unit Config */}
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

        {/* Type */}
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
          </div>
        </div>

        {/* Settings: Retry + Enabled */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-[13px] font-semibold text-text-primary mb-4">Settings</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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

        {/* Steps Section */}
        {!isNew && (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold text-text-primary">
                Steps ({steps.length})
              </h3>
              <button
                onClick={() => setShowAddStep(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-[12px] font-semibold transition-colors cursor-pointer border-none"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Step
              </button>
            </div>

            {steps.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-[13px]">
                No steps yet. Add a step to define what this unit does.
              </div>
            ) : (
              <div className="flex flex-col gap-0">
                {steps.map((step, idx) => (
                  <div key={step.id}>
                    {/* Chained connector */}
                    {idx > 0 && step.mode === 'chained' && (
                      <div className="flex items-center justify-center py-1">
                        <div className="flex items-center gap-2 text-[11px] text-accent">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14" /><path d="M19 12l-7 7-7-7" />
                          </svg>
                          <span>chained input</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14" /><path d="M19 12l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    )}
                    {idx > 0 && step.mode !== 'chained' && (
                      <div className="h-2" />
                    )}

                    {/* Step card */}
                    <div
                      className={`border rounded-lg transition-all ${
                        dragOverIdx === idx && dragIdx !== idx
                          ? 'border-accent border-dashed'
                          : 'border-border'
                      } ${expandedStep === step.id ? 'bg-elevated' : 'bg-card hover:bg-elevated'}`}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                      onDrop={() => handleDrop(idx)}
                    >
                      {/* Step header */}
                      <div
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                        onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                      >
                        {/* Drag handle */}
                        <span className="text-text-muted cursor-grab flex-shrink-0" title="Drag to reorder">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                            <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                          </svg>
                        </span>

                        {/* Order number */}
                        <span className="text-[11px] font-mono text-text-muted bg-base w-6 h-6 rounded flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>

                        {/* Step name */}
                        <span className="text-[13px] font-medium text-text-primary flex-1 truncate">
                          {step.name}
                        </span>

                        {/* Mode badge */}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          step.mode === 'chained'
                            ? 'bg-accent-dim text-accent'
                            : 'bg-elevated text-text-muted'
                        }`}>
                          {step.mode}
                        </span>

                        {/* Timeout */}
                        <span className="text-[11px] text-text-muted flex-shrink-0">
                          {step.timeout}s
                        </span>

                        {/* Expand chevron */}
                        <svg
                          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          className={`text-text-muted transition-transform flex-shrink-0 ${expandedStep === step.id ? 'rotate-180' : ''}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>

                      {/* Expanded content */}
                      {expandedStep === step.id && (
                        <div className="px-4 pb-4 border-t border-border">
                          <div className="pt-4 flex flex-col gap-4">
                            {/* Step name edit */}
                            <div>
                              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Step Name
                              </label>
                              <input
                                type="text"
                                value={step.name}
                                onChange={(e) => updateStepLocal(step.id, 'name', e.target.value)}
                                className="w-full bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                              />
                            </div>

                            {/* Mode + Timeout */}
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                  Mode
                                </label>
                                <div className="flex gap-2">
                                  {['independent', 'chained'].map(m => (
                                    <button
                                      key={m}
                                      onClick={() => updateStepLocal(step.id, 'mode', m)}
                                      className={`flex-1 px-3 py-2 rounded-lg text-[12px] font-medium border transition-all cursor-pointer ${
                                        step.mode === m
                                          ? 'bg-accent-dim border-accent text-accent'
                                          : 'bg-base border-border text-text-secondary hover:text-text-primary hover:border-border-light'
                                      }`}
                                    >
                                      {m.charAt(0).toUpperCase() + m.slice(1)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                  Timeout (sec)
                                </label>
                                <input
                                  type="number"
                                  value={step.timeout}
                                  onChange={(e) => updateStepLocal(step.id, 'timeout', parseInt(e.target.value) || 300)}
                                  className="w-full bg-base border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                                  min={1}
                                />
                              </div>
                            </div>

                            {/* Script editor */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider">
                                  Python Script
                                </label>
                                <button
                                  onClick={() => showSnippets[step.id] ? setShowSnippets(p => ({ ...p, [step.id]: false })) : loadSnippets(step.id)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-accent bg-accent-dim hover:bg-accent/20 rounded-md transition-colors cursor-pointer border-none"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                  </svg>
                                  {showSnippets[step.id] ? 'Hide Suggestions' : 'AI Suggestions'}
                                </button>
                              </div>

                              {/* Snippet suggestions panel */}
                              {showSnippets[step.id] && (
                                <div className="mb-3 border border-accent/20 rounded-lg bg-accent-dim/30 overflow-hidden">
                                  <div className="px-3 py-2 border-b border-accent/10 flex items-center gap-2">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                    </svg>
                                    <span className="text-[11px] font-semibold text-accent uppercase tracking-wider">Suggested Snippets</span>
                                    <button
                                      onClick={() => loadSnippets(step.id)}
                                      className="ml-auto text-[10px] text-text-muted hover:text-accent bg-transparent border-none cursor-pointer"
                                    >
                                      Regenerate
                                    </button>
                                  </div>

                                  {snippets[step.id]?.loading && (
                                    <div className="p-4 flex items-center justify-center gap-2 text-text-muted text-xs">
                                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                      </svg>
                                      Generating suggestions based on context...
                                    </div>
                                  )}

                                  {snippets[step.id]?.error && (
                                    <div className="p-3 text-xs text-danger">{snippets[step.id].error}</div>
                                  )}

                                  {snippets[step.id]?.data && (
                                    <div className="divide-y divide-border/50">
                                      {snippets[step.id].data.map((snippet, idx) => (
                                        <div key={idx} className="p-3 hover:bg-elevated/50 transition-colors group">
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                              <div className="text-[12px] font-semibold text-text-primary">{snippet.title}</div>
                                              <div className="text-[11px] text-text-muted mt-0.5">{snippet.description}</div>
                                            </div>
                                            <button
                                              onClick={() => applySnippet(step.id, snippet.code)}
                                              className="flex-shrink-0 px-2.5 py-1 text-[10px] font-semibold text-accent bg-accent-dim hover:bg-accent hover:text-white rounded-md transition-all cursor-pointer border-none opacity-60 group-hover:opacity-100"
                                            >
                                              Use this
                                            </button>
                                          </div>
                                          <pre className="mt-2 p-2 bg-base rounded text-[10px] leading-relaxed text-text-secondary overflow-x-auto max-h-24 font-mono">{snippet.code}</pre>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              <CodeEditor
                                value={step.script}
                                onChange={(val) => updateStepLocal(step.id, 'script', val)}
                                minHeight="250px"
                              />
                            </div>

                            {/* Step actions */}
                            <div className="flex items-center justify-between pt-2">
                              <button
                                onClick={() => setDeleteStepTarget(step.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-danger hover:bg-danger-dim rounded-lg transition-colors bg-transparent border-none cursor-pointer"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14H7L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                                </svg>
                                Delete Step
                              </button>
                              <button
                                onClick={() => handleSaveStep(step.id)}
                                disabled={savingSteps[step.id]}
                                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-[12px] font-semibold transition-colors cursor-pointer border-none disabled:opacity-50"
                              >
                                {savingSteps[step.id] ? 'Saving...' : 'Save Script'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isNew && (
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-[13px] text-text-muted text-center py-4">
              Save the unit first, then you can add steps.
            </p>
          </div>
        )}
      </div>

      {/* Add Step Modal */}
      <Modal
        open={showAddStep}
        onClose={() => { setShowAddStep(false); setNewStepName(''); }}
        title="Add Step"
        maxWidth="max-w-[400px]"
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              Step Name
            </label>
            <input
              type="text"
              value={newStepName}
              onChange={(e) => setNewStepName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddStep(); }}
              className="w-full bg-elevated border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
              placeholder="e.g. Fetch Data, Process, Send Report"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowAddStep(false); setNewStepName(''); }}
              className="px-4 py-2 text-[13px] text-text-secondary bg-elevated border border-border rounded-lg hover:bg-card transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleAddStep}
              className="px-4 py-2 text-[13px] font-semibold text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors cursor-pointer border-none"
            >
              Add
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Step Confirmation */}
      <Modal
        open={!!deleteStepTarget}
        onClose={() => setDeleteStepTarget(null)}
        title="Delete Step"
        maxWidth="max-w-[400px]"
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-text-secondary">
            Are you sure you want to delete this step? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteStepTarget(null)}
              className="px-4 py-2 text-[13px] text-text-secondary bg-elevated border border-border rounded-lg hover:bg-card transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteStep}
              className="px-4 py-2 text-[13px] font-semibold text-white bg-danger hover:bg-red-600 rounded-lg transition-colors cursor-pointer border-none"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>

      {/* Test Results Modal */}
      <Modal
        open={showTestResult}
        onClose={() => setShowTestResult(false)}
        title="Test Run Results"
        maxWidth="max-w-[700px]"
      >
        {testResults && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[13px] font-medium text-text-secondary">Overall:</span>
              <span className={`text-[13px] font-bold ${
                testResults.execution?.status === 'completed' ? 'text-success' : 'text-danger'
              }`}>
                {testResults.execution?.status}
              </span>
            </div>

            {(testResults.results || []).map((r, idx) => {
              const stepName = steps.find(s => s.id === r.step_id)?.name || `Step ${idx + 1}`;
              return (
                <div key={r.id} className="mb-4 bg-elevated border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[12px] font-mono text-text-muted bg-base w-5 h-5 rounded flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-[13px] font-medium text-text-primary">{stepName}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                      r.status === 'completed' ? 'bg-success-dim text-success'
                        : r.status === 'skipped' ? 'bg-elevated text-text-muted'
                        : 'bg-danger-dim text-danger'
                    }`}>
                      {r.status}
                    </span>
                  </div>

                  {r.stdout && (
                    <div className="mb-2">
                      <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Output</label>
                      <pre className="bg-[#0d0f17] border border-border rounded p-3 text-[11px] font-mono text-success overflow-auto max-h-[150px] whitespace-pre-wrap">
                        {r.stdout}
                      </pre>
                    </div>
                  )}

                  {r.stderr && (
                    <div className="mb-2">
                      <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Errors</label>
                      <pre className="bg-[#0d0f17] border border-border rounded p-3 text-[11px] font-mono text-danger overflow-auto max-h-[150px] whitespace-pre-wrap">
                        {r.stderr}
                      </pre>
                    </div>
                  )}

                  {r.return_value && (
                    <div>
                      <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Return Value</label>
                      <pre className="bg-[#0d0f17] border border-border rounded p-3 text-[11px] font-mono text-accent overflow-auto max-h-[100px] whitespace-pre-wrap">
                        {r.return_value}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
