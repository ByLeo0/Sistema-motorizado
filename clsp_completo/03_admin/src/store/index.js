import {create} from 'zustand';
import {authAPI} from '../services/api';

// ── Tema (claro / oscuro) ────────────────────────────────────────────────────
const savedTheme = localStorage.getItem('clsp_theme') ?? 'light';
if (savedTheme === 'dark') document.documentElement.classList.add('dark');

export const useThemeStore = create((set) => ({
  theme: savedTheme,
  toggle: () => set(state => {
    const next = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('clsp_theme', next);
    return {theme: next};
  }),
}));

// ── Autenticación ─────────────────────────────────────────────────────────
export const useAuthStore = create((set) => ({
  user:      authAPI.getUser(),
  isLoading: false,

  login: async (email, password) => {
    set({isLoading: true});
    try {
      const data = await authAPI.login(email, password);
      set({user: data.user, isLoading: false});
      return data.user;
    } catch (err) {
      set({isLoading: false});
      throw err;
    }
  },

  logout: async () => {
    await authAPI.logout();
    set({user: null});
  },
}));

// ── Mapa en vivo (tracking de un servicio activo) ────────────────────────
export const useMapStore = create((set, get) => ({
  watchedServiceId: null,   // id del servicio que el admin está viendo
  wsStatus:        'idle',  // 'idle' | 'connected' | 'disconnected' | 'error'
  liveLocation:    null,    // {lat, lng, speed_kmh, heading, deviation_meters, is_deviated, timestamp}
  locationHistory: [],      // últimas 100 posiciones para trazar la trayectoria real
  deviationAlerts: [],      // incidencias de desvío recibidas en la sesión actual

  setWatchedService: id  => set({watchedServiceId: id, locationHistory: [], deviationAlerts: []}),
  setWsStatus:       s   => set({wsStatus: s}),

  pushLocation: loc => set(state => ({
    liveLocation:    loc,
    locationHistory: [...state.locationHistory.slice(-99), {lat: loc.lat, lng: loc.lng}],
  })),

  pushAlert: alert => set(state => ({
    deviationAlerts: [alert, ...state.deviationAlerts].slice(0, 20),
  })),

  clearWatch: () => set({
    watchedServiceId: null,
    wsStatus:        'idle',
    liveLocation:    null,
    locationHistory: [],
    deviationAlerts: [],
  }),
}));
