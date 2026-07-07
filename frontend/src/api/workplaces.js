import { apiFetch } from './client';

export const workplacesApi = {
  list() {
    return apiFetch('/workplaces');
  },

  get(id) {
    return apiFetch(`/workplaces/${id}`);
  },

  create(data) {
    return apiFetch('/workplaces', { method: 'POST', body: data });
  },

  update(id, data) {
    return apiFetch(`/workplaces/${id}`, { method: 'PUT', body: data });
  },

  delete(id) {
    return apiFetch(`/workplaces/${id}`, { method: 'DELETE' });
  },

  dashboard(id) {
    return apiFetch(`/workplaces/${id}/dashboard`);
  },
};
