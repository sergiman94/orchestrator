import { apiFetch } from './client';

export const agentApi = {
  getConfig(workplaceId) {
    return apiFetch(`/workplaces/${workplaceId}/agent`);
  },

  updateConfig(workplaceId, data) {
    return apiFetch(`/workplaces/${workplaceId}/agent`, { method: 'PUT', body: data });
  },

  invoke(workplaceId, message) {
    return apiFetch(`/workplaces/${workplaceId}/agent/invoke`, { method: 'POST', body: { message } });
  },

  getHistory(workplaceId) {
    return apiFetch(`/workplaces/${workplaceId}/agent/history`);
  },

  chat(workplaceId, message) {
    return apiFetch(`/workplaces/${workplaceId}/agent/chat`, { method: 'POST', body: { message } });
  },
};
