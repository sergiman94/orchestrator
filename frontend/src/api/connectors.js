import { apiFetch } from './client';

export const connectorsApi = {
  list(workplaceId) {
    return apiFetch(`/workplaces/${workplaceId}/connectors`);
  },
  get(workplaceId, connectorId) {
    return apiFetch(`/workplaces/${workplaceId}/connectors/${connectorId}`);
  },
  create(workplaceId, data) {
    return apiFetch(`/workplaces/${workplaceId}/connectors`, {
      method: 'POST',
      body: data,
    });
  },
  update(workplaceId, connectorId, data) {
    return apiFetch(`/workplaces/${workplaceId}/connectors/${connectorId}`, {
      method: 'PUT',
      body: data,
    });
  },
  delete(workplaceId, connectorId) {
    return apiFetch(`/workplaces/${workplaceId}/connectors/${connectorId}`, {
      method: 'DELETE',
    });
  },
  checkHealth(workplaceId, connectorId) {
    return apiFetch(`/workplaces/${workplaceId}/connectors/${connectorId}/health`);
  },
};
