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
