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
const TRAIL_MAX_POINTS = 500; // máximo de puntos en el rastro visible

export const useTrackingStore = create((set) => ({
  isTracking:       false,
  isConnected:      false,   // WebSocket conectado
  lastLocation:     null,    // {lat, lng, speed, heading, accuracy, timestamp}
  deviationMeters:  0,
  isDeviated:       false,
  routeStatus:      'EN_RUTA',   // 'EN_RUTA' | 'DESVIADO'
  snappedPoint:     null,        // {lat, lng}
  reentryPoint:     null,        // {lat, lng}
  totalPings:       0,

  // ── Señal GPS ────────────────────────────────────────────────────────────
  // 'idle' → aún no iniciado
  // 'searching' → iniciado, esperando primer fix
  // 'active' → recibiendo ubicaciones normalmente
  // 'lost' → sin actualización por > GPS_SIGNAL_TIMEOUT_MS
  gpsSignalStatus:  'idle',

  // ── Rastro del recorrido ─────────────────────────────────────────────────
  locationTrail: [],  // [{latitude, longitude}, ...] para polyline en mapa

  setTracking:      v => set({isTracking: v}),
  setConnected:     v => set({isConnected: v}),
  setLastLocation:  location => set({lastLocation: location}),
  setGpsSignalStatus: status => set({gpsSignalStatus: status}),

  appendTrail: (lat, lng) => set(s => {
    const trail = s.locationTrail;
    const last  = trail[trail.length - 1];
    // No agregar si es el mismo punto exacto
    if (last && last.latitude === lat && last.longitude === lng) return {};
    const next = trail.length >= TRAIL_MAX_POINTS
      ? trail.slice(-TRAIL_MAX_POINTS + 1)
      : trail;
    return {locationTrail: [...next, {latitude: lat, longitude: lng}]};
  }),

  updateDeviation: ({deviation_meters, is_deviated, route_status, snapped_lat, snapped_lng, reentry_lat, reentry_lng}) =>
    set({
      deviationMeters: deviation_meters,
      isDeviated:      is_deviated,
      routeStatus:     route_status ?? (is_deviated ? 'DESVIADO' : 'EN_RUTA'),
      snappedPoint:    (snapped_lat != null && snapped_lng != null)
                         ? {lat: snapped_lat, lng: snapped_lng}
                         : null,
      reentryPoint:    (reentry_lat != null && reentry_lng != null)
                         ? {lat: reentry_lat, lng: reentry_lng}
                         : null,
    }),

  incrementPings: () => set(s => ({totalPings: s.totalPings + 1})),

  resetTracking: () => set({
    isTracking: false, isConnected: false, lastLocation: null,
    deviationMeters: 0, isDeviated: false, routeStatus: 'EN_RUTA',
    snappedPoint: null, reentryPoint: null, totalPings: 0,
    gpsSignalStatus: 'idle', locationTrail: [],
  }),
}));
