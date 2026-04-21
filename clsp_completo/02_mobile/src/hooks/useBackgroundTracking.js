/**
 * Hook para geolocalización en background.
 * Usa react-native-background-geolocation para seguir rastreando
 * incluso cuando la app está minimizada o la pantalla apagada.
 *
 * Cada vez que llega una ubicación nueva, la envía por WebSocket al backend.
 * Si el WebSocket no está conectado, hace fallback al endpoint REST.
 */
import {useEffect, useRef, useCallback} from 'react';
import BackgroundGeolocation from 'react-native-background-geolocation';
import NetInfo from '@react-native-community/netinfo';
import {trackingWS} from '../services/websocket';
import {trackingAPI} from '../services/api';
import {useTrackingStore} from '../store';
import {useOfflineQueue} from './useOfflineQueue';
import Toast from 'react-native-toast-message';

const GPS_INTERVAL_SECONDS = 5; // Enviar ping cada 5 segundos

export function useBackgroundTracking(serviceId) {
  const setLastLocation = useTrackingStore(s => s.setLastLocation);
  const updateDeviation = useTrackingStore(s => s.updateDeviation);
  const setConnected    = useTrackingStore(s => s.setConnected);
  const incrementPings  = useTrackingStore(s => s.incrementPings);
  const setTracking     = useTrackingStore(s => s.setTracking);
  const isDeviated      = useTrackingStore(s => s.isDeviated);

  const {enqueue} = useOfflineQueue(serviceId);
  const isOnlineRef = useRef(true);

  const isDeviatedRef = useRef(isDeviated);
  useEffect(() => { isDeviatedRef.current = isDeviated; }, [isDeviated]);

  // Track online/offline state
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      isOnlineRef.current = !!(state.isConnected && state.isInternetReachable);
    });
    return () => unsub();
  }, []);

  // Conectar WebSocket al montar
  useEffect(() => {
    if (!serviceId) return;

    trackingWS.onConnectionChange = connected => {
      setConnected(connected);
    };

    trackingWS.onTrackingUpdate = msg => {
      updateDeviation({
        deviation_meters: msg.deviation_meters,
        is_deviated:      msg.is_deviated,
      });
      incrementPings();
    };

    trackingWS.onDeviation = msg => {
      if (!isDeviatedRef.current) {
        Toast.show({
          type:  'error',
          text1: 'Desvio de ruta detectado',
          text2: `${msg.deviation_meters.toFixed(0)}m fuera del corredor permitido`,
        });
      }
    };

    trackingWS.onError = err => {
      console.warn('[WS Error]', err);
    };

    trackingWS.connect(serviceId);
    return () => trackingWS.disconnect();
  }, [serviceId]);

  const startTracking = useCallback(async () => {
    // Configuracion de background geolocation
    await BackgroundGeolocation.ready({
      desiredAccuracy:          BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
      distanceFilter:           10,          // metros minimos entre pings
      stopTimeout:              5,           // minutos para detener si no hay movimiento
      debug:                    false,       // true para escuchar sonidos de debug
      logLevel:                 BackgroundGeolocation.LOG_LEVEL_WARNING,
      stopOnTerminate:          false,       // seguir aunque la app se cierre
      startOnBoot:              false,
      heartbeatInterval:        GPS_INTERVAL_SECONDS,
      locationUpdateInterval:   GPS_INTERVAL_SECONDS * 1000,  // ms
      fastestLocationUpdateInterval: 3000,
      // Android: notificacion persistente mientras rastrea
      notification: {
        title:    'CLSP — Rastreo activo',
        text:     'Tu ubicacion esta siendo enviada al sistema.',
        smallIcon: 'ic_launcher',
      },
    });

    // Listener principal: se dispara con cada nueva ubicacion
    BackgroundGeolocation.onLocation(location => {
      const payload = {
        lat:      location.coords.latitude,
        lng:      location.coords.longitude,
        speed:    Math.max(0, (location.coords.speed ?? 0) * 3.6), // m/s → km/h
        heading:  location.coords.heading ?? 0,
        accuracy: location.coords.accuracy ?? 0,
      };

      setLastLocation({...payload, timestamp: location.timestamp});

      // If offline: enqueue for later sync
      if (!isOnlineRef.current) {
        enqueue(payload);
        return;
      }

      // Intentar WebSocket primero, REST como fallback
      const sent = trackingWS.sendPing(payload);
      if (!sent) {
        trackingAPI
          .ping({service_id: serviceId, ...payload})
          .then(res => {
            updateDeviation({
              deviation_meters: res.data.deviation_meters,
              is_deviated:      res.data.is_deviated,
            });
          })
          .catch(err => {
            // Connection dropped mid-send — queue the ping
            enqueue(payload);
            console.warn('[REST ping fallback error]', err.message);
          });
      }
    }, error => {
      console.error('[GPS Error]', error);
    });

    await BackgroundGeolocation.start();
    setTracking(true);
  }, [serviceId]);

  const stopTracking = useCallback(async () => {
    await BackgroundGeolocation.stop();
    BackgroundGeolocation.removeListeners();
    setTracking(false);
  }, []);

  return {startTracking, stopTracking};
}
