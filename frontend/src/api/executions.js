import { apiFetch } from './client';

export const executionsApi = {
  list(workplaceId) {
    return apiFetch(`/workplaces/${workplaceId}/executions`);
  },

  get(executionId) {
    return apiFetch(`/executions/${executionId}`);
  },

  active(workplaceId) {
    return apiFetch(`/workplaces/${workplaceId}/executions/active`);
  },
};
