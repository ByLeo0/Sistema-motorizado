/**
 * Estado global con Zustand.
 * Maneja: sesion del usuario, servicio activo, estado del tracking.
 */
import {create} from 'zustand';
import {authService} from '../services/api';

// ── Store de autenticacion ────────────────────────────────────────────────
export const useAuthStore = create((set, get) => ({
  user:         null,
  isLoading:    true,
  isLoggedIn:   false,

  // Llamar al inicio de la app para restaurar sesion guardada
  hydrate: async () => {
    const user = await authService.getStoredUser();
    set({user, isLoggedIn: !!user, isLoading: false});
  },

  login: async (email, password) => {
    const data = await authService.login(email, password);
    set({user: data.user, isLoggedIn: true});
    return data.user;
  },

  logout: async () => {
    await authService.logout();
    set({user: null, isLoggedIn: false});
  },

  setUser: (user) => set({user}),
}));

// ── Store del servicio activo (el que esta en transito) ───────────────────
export const useServiceStore = create((set, get) => ({
  activeService:   null,   // objeto completo del servicio
  services:        [],     // lista de servicios del motorizado
  isLoadingList:   false,

  setActiveService: service => set({activeService: service}),
  clearActive:      ()      => set({activeService: null}),
  setServices:      list    => set({services: list}),

  updateServiceStatus: (id, status) =>
    set(state => ({
      services: state.services.map(s => s.id === id ? {...s, status} : s),
      activeService:
        state.activeService?.id === id
          ? {...state.activeService, status}
          : state.activeService,
    })),
}));

// ── Store de tracking GPS ─────────────────────────────────────────────────
export const useTrackingStore = create((set) => ({
  isTracking:       false,
  isConnected:      false,   // WebSocket conectado
  lastLocation:     null,    // {lat, lng, speed, heading, accuracy, timestamp}
  deviationMeters:  0,
  isDeviated:       false,
  totalPings:       0,

  setTracking:      v         => set({isTracking: v}),
  setConnected:     v         => set({isConnected: v}),
  setLastLocation:  location  => set({lastLocation: location}),
  updateDeviation: ({deviation_meters, is_deviated}) =>
    set({deviationMeters: deviation_meters, isDeviated: is_deviated}),
  incrementPings: () => set(s => ({totalPings: s.totalPings + 1})),
  resetTracking:  () => set({
    isTracking: false, isConnected: false, lastLocation: null,
    deviationMeters: 0, isDeviated: false, totalPings: 0,
  }),
}));
