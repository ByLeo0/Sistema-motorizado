import React from 'react';
import {BrowserRouter, Routes, Route, Navigate} from 'react-router-dom';
import {useAuthStore} from './store';
import Layout        from './components/ui/Layout';
import LoginPage     from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ServicesPage  from './pages/ServicesPage';
import ServiceDetailPage  from './pages/ServiceDetailPage';
import ApproveServicePage from './pages/ApproveServicePage';
import LiveMapPage        from './pages/LiveMapPage';
import IncidentsPage from './pages/IncidentsPage';
import UsersPage     from './pages/UsersPage';

function RequireAuth({children}) {
  const user = useAuthStore(s => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={
          <RequireAuth><Layout /></RequireAuth>
        }>
          <Route index              element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"   element={<DashboardPage />} />
          <Route path="services"    element={<ServicesPage />} />
          <Route path="services/:id"          element={<ServiceDetailPage />} />
          <Route path="services/:id/approve" element={<ApproveServicePage />} />
          <Route path="live-map"    element={<LiveMapPage />} />
          <Route path="incidents"   element={<IncidentsPage />} />
          <Route path="users"       element={<UsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
