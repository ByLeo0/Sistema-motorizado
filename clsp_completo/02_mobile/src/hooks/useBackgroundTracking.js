import {useEffect, useRef, useCallback} from 'react';
import {Platform} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {trackingWS} from '../services/websocket';
import {trackingAPI} from '../services/api';
import {useTrackingStore} from '../store';
import {useOfflineQueue} from './useOfflineQueue';
import Toast from 'react-native-toast-message';

const GPS_INTERVAL_MS       = 5000;
const GPS_SIGNAL_TIMEOUT_MS = 15000; // sin fix → señal perdida
const GPS_SIGNAL_CHECK_MS   = 5000;  // intervalo de chequeo de señal

export function useBackgroundTracking(serviceId) {
  const setLastLocation     = useTrackingStore(s => s.setLastLocation);
  const updateDeviation     = useTrackingStore(s => s.updateDeviation);
  const setConnected        = useTrackingStore(s => s.setConnected);
  const incrementPings      = useTrackingStore(s => s.incrementPings);
  const setTracking         = useTrackingStore(s => s.setTracking);
  const setGpsSignalStatus  = useTrackingStore(s => s.setGpsSignalStatus);
  const appendTrail         = useTrackingStore(s => s.appendTrail);
  const isDeviated          = useTrackingStore(s => s.isDeviated);

  const {enqueue}         = useOfflineQueue(serviceId);
  const isOnlineRef       = useRef(true);
  const watchIdRef        = useRef(null);
  const bgSubRef          = useRef(null);
  const useBGRef          = useRef(false);
  const isDeviatedRef     = useRef(isDeviated);
  const lastFixTimeRef    = useRef(null);   // timestamp del último fix GPS
  const signalCheckRef    = useRef(null);   // setInterval para detectar pérdida
  const signalLostRef     = useRef(false);  // evita Toast repetidos

  useEffect(() => { isDeviatedRef.current = isDeviated; }, [isDeviated]);

  // Monitor de red
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      isOnlineRef.current = !!(state.isConnected && state.isInternetReachable);
    });
    return () => unsub();
  }, []);

  // WebSocket lifecycle
  useEffect(() => {
    if (!serviceId) return;

    trackingWS.onConnectionChange = connected => setConnected(connected);
    trackingWS.onTrackingUpdate   = msg => {
      updateDeviation({
        deviation_meters: msg.deviation_meters,
        is_deviated:      msg.is_deviated,
        route_status:     msg.route_status,
        snapped_lat:      msg.snapped_lat,
        snapped_lng:      msg.snapped_lng,
        reentry_lat:      msg.reentry_lat,
        reentry_lng:      msg.reentry_lng,
      });
      incrementPings();
    };
    trackingWS.onDeviation = msg => {
      if (!isDeviatedRef.current) {
        Toast.show({
          type:  'error',
          text1: 'Desvío de ruta detectado',
          text2: `${msg.deviation_meters?.toFixed(0)}m fuera del corredor`,
        });
      }
    };
    trackingWS.onError = err => console.warn('[WS]', err);
    trackingWS.connect(serviceId);

    return () => trackingWS.disconnect();
  }, [serviceId]);

  // ── Chequeo periódico de señal GPS ────────────────────────────────────────
  const startSignalMonitor = useCallback(() => {
    signalCheckRef.current = setInterval(() => {
      if (!lastFixTimeRef.current) return;
      const elapsed = Date.now() - lastFixTimeRef.current;
      if (elapsed > GPS_SIGNAL_TIMEOUT_MS && !signalLostRef.current) {
        signalLostRef.current = true;
        setGpsSignalStatus('lost');
        Toast.show({
          type:     'error',
          text1:    'Señal GPS perdida',
          text2:    'Sin ubicación. Verifica que el GPS esté activado.',
          position: 'top',
        });
      }
    }, GPS_SIGNAL_CHECK_MS);
  }, [setGpsSignalStatus]);

  const stopSignalMonitor = useCallback(() => {
    if (signalCheckRef.current) {
      clearInterval(signalCheckRef.current);
      signalCheckRef.current = null;
    }
  }, []);

  // Llamar cada vez que llega un fix GPS
  const onFixReceived = useCallback((lat, lng) => {
    const wasLost = signalLostRef.current;
    lastFixTimeRef.current = Date.now();
    signalLostRef.current  = false;
    setGpsSignalStatus('active');
    appendTrail(lat, lng);
    if (wasLost) {
      Toast.show({
        type:     'success',
        text1:    'Señal GPS recuperada',
        text2:    'Ubicación activa nuevamente.',
        position: 'top',
      });
    }
  }, [setGpsSignalStatus, appendTrail]);

  // ── Enviar ping al backend ────────────────────────────────────────────────
  const sendPing = useCallback((payload) => {
    if (!isOnlineRef.current) { enqueue(payload); return; }
    const sent = trackingWS.sendPing(payload);
    if (!sent) {
      trackingAPI.ping({service_id: serviceId, ...payload})
        .then(res => updateDeviation({
          deviation_meters: res.data.deviation_meters,
          is_deviated:      res.data.is_deviated,
          route_status:     res.data.route_status,
          snapped_lat:      res.data.snapped_lat,
          snapped_lng:      res.data.snapped_lng,
          reentry_lat:      res.data.reentry_lat,
          reentry_lng:      res.data.reentry_lng,
        }))
        .catch(() => enqueue(payload));
    }
  }, [serviceId]);

  // ── Foreground GPS ────────────────────────────────────────────────────────
  const startForegroundTracking = useCallback(() => {
    if (!navigator.geolocation) return false;
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const {latitude, longitude, speed, heading, accuracy} = pos.coords;
        const payload = {
          lat:      latitude,
          lng:      longitude,
          speed:    Math.max(0, (speed ?? 0) * 3.6),
          heading:  heading  ?? 0,
          accuracy: accuracy ?? 0,
        };
        setLastLocation({...payload, timestamp: pos.timestamp});
        onFixReceived(latitude, longitude);
        sendPing(payload);
        incrementPings();
      },
      err => {
        console.warn('[GPS foreground]', err.message);
        // POSITION_UNAVAILABLE o TIMEOUT → señal perdida
        if (err.code === 2 || err.code === 3) {
          if (!signalLostRef.current) {
            signalLostRef.current = true;
            setGpsSignalStatus('lost');
            Toast.show({
              type:     'error',
              text1:    'Señal GPS perdida',
              text2:    'Sin ubicación. Verifica que el GPS esté activado.',
              position: 'top',
            });
          }
        }
      },
      {enableHighAccuracy: true, maximumAge: 3000, timeout: GPS_SIGNAL_TIMEOUT_MS},
    );
    return watchIdRef.current !== null;
  }, [sendPing, onFixReceived, setGpsSignalStatus]);

  const stopForegroundTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // ── Background GPS ────────────────────────────────────────────────────────
  const startBGTracking = useCallback(async () => {
    let BackgroundGeolocation;
    try {
      BackgroundGeolocation = require('react-native-background-geolocation').default;
    } catch {
      return false;
    }

    await BackgroundGeolocation.ready({
      desiredAccuracy:               BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
      distanceFilter:                10,
      stopTimeout:                   5,
      debug:                         false,
      logLevel:                      BackgroundGeolocation.LOG_LEVEL_WARNING,
      stopOnTerminate:               false,
      startOnBoot:                   false,
      heartbeatInterval:             GPS_INTERVAL_MS / 1000,
      locationUpdateInterval:        GPS_INTERVAL_MS,
      fastestLocationUpdateInterval: 3000,
      notification: {
        title: 'CLSP — Rastreo activo',
        text:  'Tu ubicación está siendo enviada al sistema.',
      },
    });

    const sub = BackgroundGeolocation.onLocation(location => {
      const {latitude, longitude, speed, heading, accuracy} = location.coords;
      const payload = {
        lat:      latitude,
        lng:      longitude,
        speed:    Math.max(0, (speed ?? 0) * 3.6),
        heading:  heading  ?? 0,
        accuracy: accuracy ?? 0,
      };
      setLastLocation({...payload, timestamp: location.timestamp});
      onFixReceived(latitude, longitude);
      sendPing(payload);
      incrementPings();
    });

    bgSubRef.current = sub;
    await BackgroundGeolocation.start();
    return true;
  }, [sendPing, onFixReceived]);

  const stopBGTracking = useCallback(async () => {
    try {
      const BackgroundGeolocation = require('react-native-background-geolocation').default;
      bgSubRef.current?.remove?.();
      bgSubRef.current = null;
      await BackgroundGeolocation.stop();
    } catch (e) {
      console.warn('[BGGeo stop]', e.message);
    }
  }, []);

  // ── API pública ───────────────────────────────────────────────────────────
  const startTracking = useCallback(async () => {
    // Inicializar estado de señal
    lastFixTimeRef.current = null;
    signalLostRef.current  = false;
    setGpsSignalStatus('searching');

    useBGRef.current = false;
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      try {
        const ok = await startBGTracking();
        if (ok) { useBGRef.current = true; }
      } catch (e) {
        console.warn('[BGGeo start failed, using foreground]', e.message);
      }
    }

    if (!useBGRef.current) {
      startForegroundTracking();
    }

    startSignalMonitor();
    setTracking(true);
    Toast.show({type: 'success', text1: 'Recorrido iniciado', text2: 'Buscando señal GPS...'});
  }, [startBGTracking, startForegroundTracking, startSignalMonitor, setGpsSignalStatus]);

  const stopTracking = useCallback(async () => {
    stopSignalMonitor();
    if (useBGRef.current) {
      await stopBGTracking();
    } else {
      stopForegroundTracking();
    }
    setTracking(false);
    setGpsSignalStatus('idle');
  }, [stopBGTracking, stopForegroundTracking, stopSignalMonitor, setGpsSignalStatus]);

  return {startTracking, stopTracking};
}
