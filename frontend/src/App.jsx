import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import WorkspaceLayout from './components/WorkspaceLayout';
import Login from './pages/Login';
import Workplaces from './pages/Workplaces';
import WorkplaceDashboard from './pages/WorkplaceDashboard';
import Units from './pages/Units';
import UnitEditor from './pages/UnitEditor';
import AgentPanel from './pages/AgentPanel';
import MemoryBrowser from './pages/MemoryBrowser';
import ExecutionHistory from './pages/ExecutionHistory';
import ExecutionDetail from './pages/ExecutionDetail';

function ProtectedRoute({ children }) {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="flex items-center gap-3 text-text-muted">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  const { token, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          !loading && token ? <Navigate to="/workplaces" replace /> : <Login />
        }
      />

      {/* Workplace list — uses top-level layout (no sidebar) */}
      <Route
        path="/workplaces"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Workplaces />} />
      </Route>

      {/* Inside a workspace — uses sidebar layout */}
      <Route
        path="/workplaces/:id"
        element={
          <ProtectedRoute>
            <WorkspaceLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<WorkplaceDashboard />} />
        <Route path="units" element={<Units />} />
        <Route path="units/new" element={<UnitEditor />} />
        <Route path="units/:unitId" element={<UnitEditor />} />
        <Route path="agent" element={<AgentPanel />} />
        <Route path="memory" element={<MemoryBrowser />} />
        <Route path="history" element={<ExecutionHistory />} />
        <Route path="executions/:executionId" element={<ExecutionDetail />} />
      </Route>

      <Route path="/" element={<Navigate to={token ? '/workplaces' : '/login'} replace />} />
      <Route path="*" element={<Navigate to={token ? '/workplaces' : '/login'} replace />} />
    </Routes>
  );
}
