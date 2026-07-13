import { apiFetch } from './client';

export const unitsApi = {
  list(workplaceId) {
    return apiFetch(`/workplaces/${workplaceId}/units`);
  },

  get(workplaceId, unitId) {
    return apiFetch(`/workplaces/${workplaceId}/units/${unitId}`);
  },

  create(workplaceId, data) {
    return apiFetch(`/workplaces/${workplaceId}/units`, { method: 'POST', body: data });
  },

  update(workplaceId, unitId, data) {
    return apiFetch(`/workplaces/${workplaceId}/units/${unitId}`, { method: 'PUT', body: data });
  },

  delete(workplaceId, unitId) {
    return apiFetch(`/workplaces/${workplaceId}/units/${unitId}`, { method: 'DELETE' });
  },

  run(workplaceId, unitId) {
    return apiFetch(`/workplaces/${workplaceId}/units/${unitId}/run`, { method: 'POST' });
  },

  test(workplaceId, unitId, data) {
    return apiFetch(`/workplaces/${workplaceId}/units/${unitId}/test`, { method: 'POST', body: data });
  },
};

export const stepsApi = {
  list(workplaceId, unitId) {
    return apiFetch(`/workplaces/${workplaceId}/units/${unitId}/steps`);
  },

  create(workplaceId, unitId, data) {
    return apiFetch(`/workplaces/${workplaceId}/units/${unitId}/steps`, { method: 'POST', body: data });
  },

  update(workplaceId, unitId, stepId, data) {
    return apiFetch(`/workplaces/${workplaceId}/units/${unitId}/steps/${stepId}`, { method: 'PUT', body: data });
  },

  delete(workplaceId, unitId, stepId) {
    return apiFetch(`/workplaces/${workplaceId}/units/${unitId}/steps/${stepId}`, { method: 'DELETE' });
  },

  reorder(workplaceId, unitId, stepIds) {
    return apiFetch(`/workplaces/${workplaceId}/units/${unitId}/steps/reorder`, {
      method: 'PUT',
      body: { step_ids: stepIds },
    });
  },

  suggestSnippets(workplaceId, unitId, stepData) {
    return apiFetch(`/workplaces/${workplaceId}/units/${unitId}/steps/suggest-snippets`, {
      method: 'POST',
      body: stepData,
    });
  },
};
