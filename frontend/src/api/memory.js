import { apiFetch } from './client';

export const memoryApi = {
  list(workplaceId, params = {}) {
    const query = new URLSearchParams();
    if (params.source_type) query.set('source_type', params.source_type);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return apiFetch(`/workplaces/${workplaceId}/memory${qs ? '?' + qs : ''}`);
  },

  search(workplaceId, query, topK = 10) {
    const params = new URLSearchParams({ query, top_k: String(topK) });
    return apiFetch(`/workplaces/${workplaceId}/memory/search?${params}`);
  },

  create(workplaceId, data) {
    return apiFetch(`/workplaces/${workplaceId}/memory`, { method: 'POST', body: data });
  },

  delete(workplaceId, memoryId) {
    return apiFetch(`/workplaces/${workplaceId}/memory/${memoryId}`, { method: 'DELETE' });
  },

  getStats(workplaceId) {
    return apiFetch(`/workplaces/${workplaceId}/memory/stats`);
  },
};
