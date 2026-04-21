import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Para emulador Android: 10.0.2.2 | Para dispositivo fisico: IP de tu PC en la red
export const BASE_URL = 'http://10.0.2.2:8000';
export const WS_URL   = 'ws://10.0.2.2:8000';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 15000,
  headers: {'Content-Type': 'application/json'},
});

// Agrega el token JWT a cada request automaticamente
api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Si el token expira (401), intenta renovarlo con el refresh token
api.interceptors.response.use(
  response => response,
  async error => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = await AsyncStorage.getItem('refresh_token');
        const {data} = await axios.post(`${BASE_URL}/api/auth/refresh/`, {refresh});
        await AsyncStorage.setItem('access_token', data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch (_) {
        await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user']);
      }
    }
    return Promise.reject(error);
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────
export const authService = {
  login: async (email, password) => {
    const {data} = await api.post('/auth/login/', {email, password});
    await AsyncStorage.setItem('access_token',  data.access);
    await AsyncStorage.setItem('refresh_token', data.refresh);
    await AsyncStorage.setItem('user',          JSON.stringify(data.user));
    return data;
  },
  logout: async () => {
    const refresh = await AsyncStorage.getItem('refresh_token');
    try { await api.post('/auth/logout/', {refresh}); } catch (_) {}
    await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user']);
  },
  getStoredUser: async () => {
    const raw = await AsyncStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  },
  updateFcmToken: token => api.patch('/users/update_fcm_token/', {fcm_token: token}),
};

// ── Servicios de transporte ────────────────────────────────────────────────
export const serviceAPI = {
  list:            params  => api.get('/services/', {params}),
  detail:          id      => api.get(`/services/${id}/`),
  start:           id      => api.post(`/services/${id}/start/`),
  complete:        id      => api.post(`/services/${id}/complete/`),
  trackingHistory: id      => api.get(`/services/${id}/tracking_history/`),
  uploadDocument: (id, formData) =>
    api.post(`/services/${id}/upload_document/`, formData, {
      headers: {'Content-Type': 'multipart/form-data'},
      timeout: 60000,
    }),
};

// ── Ping GPS REST (fallback si falla WebSocket) ───────────────────────────
export const trackingAPI = {
  ping: payload => api.post('/tracking/ping/', payload),
};

export default api;
