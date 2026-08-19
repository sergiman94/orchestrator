import { apiFetch } from './client';

export const assetsApi = {
  list(workplaceId) {
    return apiFetch(`/workplaces/${workplaceId}/assets`);
  },
  get(workplaceId, assetId) {
    return apiFetch(`/workplaces/${workplaceId}/assets/${assetId}`);
  },
  create(workplaceId, data) {
    return apiFetch(`/workplaces/${workplaceId}/assets`, { method: 'POST', body: data });
  },
  update(workplaceId, assetId, data) {
    return apiFetch(`/workplaces/${workplaceId}/assets/${assetId}`, { method: 'PUT', body: data });
  },
  delete(workplaceId, assetId) {
    return apiFetch(`/workplaces/${workplaceId}/assets/${assetId}`, { method: 'DELETE' });
  },
  checkHealth(workplaceId, assetId) {
    return apiFetch(`/workplaces/${workplaceId}/assets/${assetId}/health`);
  },
};
