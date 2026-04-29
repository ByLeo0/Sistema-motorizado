import axios from 'axios';

// En desarrollo, el proxy de Vite redirige /api → http://localhost:8000/api
const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {'Content-Type': 'application/json'},
});

// Inyectar token JWT en cada request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Refresh automático si el token expira
api.interceptors.response.use(
  res => res,
  async error => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem('refresh_token');
        const {data}  = await axios.post('/api/auth/refresh/', {refresh});
        localStorage.setItem('access_token', data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────
export const authAPI = {
  login: async (email, password) => {
    const {data} = await api.post('/auth/login/', {email, password});
    localStorage.setItem('access_token',  data.access);
    localStorage.setItem('refresh_token', data.refresh);
    localStorage.setItem('user',          JSON.stringify(data.user));
    return data;
  },
  logout: async () => {
    const refresh = localStorage.getItem('refresh_token');
    try { await api.post('/auth/logout/', {refresh}); } catch (_) {}
    localStorage.clear();
  },
  getUser: () => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  },
};

// ── Usuarios ──────────────────────────────────────────────────────────────
export const usersAPI = {
  list:         params     => api.get('/users/',              {params}),
  motorizados:  ()         => api.get('/users/motorizados/'),
  create:       data       => api.post('/users/', data),
  update:       (id, data) => api.patch(`/users/${id}/`, data),
  toggleActive: id         => api.patch(`/users/${id}/toggle_active/`),
  setPassword:  (id, pwd)  => api.post(`/users/${id}/set_password/`, {new_password: pwd}),
};

// ── Servicios ─────────────────────────────────────────────────────────────
export const servicesAPI = {
  list:      params      => api.get('/services/',               {params}),
  detail:    id          => api.get(`/services/${id}/`),
  create:    data        => api.post('/services/', data),
  dashboard: ()          => api.get('/services/dashboard/'),
  approve:  (id, body)   => api.post(`/services/${id}/approve/`, body),
  reject:   (id, body)   => api.post(`/services/${id}/reject/`,  body),
  cancel:    id          => api.post(`/services/${id}/cancel/`),
  rate:     (id, body)   => api.post(`/services/${id}/rate/`,    body),
  tracking:  id          => api.get(`/services/${id}/tracking_history/`),
};

// ── Tracking ──────────────────────────────────────────────────────────────
export const trackingAPI = {
  active: ()        => api.get('/tracking/active/'),
  stats:  (days=30) => api.get('/tracking/stats/', {params: {days}}),
};

// ── Incidencias ───────────────────────────────────────────────────────────
export const incidentsAPI = {
  list:          params        => api.get('/incidents/', {params}),
  resolve:       (id, data)   => api.patch(`/incidents/${id}/resolve/`, data),
  reassign:      (id, data)   => api.patch(`/incidents/${id}/reassign/`, data),
  cancelService: (id, data)   => api.patch(`/incidents/${id}/cancel_service/`, data),
};

// ── Vehículos ─────────────────────────────────────────────────────────────
export const vehiclesAPI = {
  list:   params      => api.get('/vehicles/',        {params}),
  create: data        => api.post('/vehicles/', data),
  update: (id, data)  => api.patch(`/vehicles/${id}/`, data),
  delete: id          => api.delete(`/vehicles/${id}/`),
};

// ── Auditoría ─────────────────────────────────────────────────────────────
export const auditAPI = {
  list: params => api.get('/audit/', {params}),
};

export default api;
