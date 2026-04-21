import {useEffect, useRef, useCallback} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {trackingAPI} from '../services/api';

const QUEUE_KEY    = 'clsp_ping_queue';
const MAX_QUEUE    = 500;
const FLUSH_DELAY  = 2000; // ms after connectivity restored before flushing

export function useOfflineQueue(serviceId) {
  const flushTimer = useRef(null);
  const isFlushing = useRef(false);

  // Enqueue a ping when offline
  const enqueue = useCallback(async (ping) => {
    try {
      const raw  = await AsyncStorage.getItem(QUEUE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (list.length >= MAX_QUEUE) list.shift(); // drop oldest to avoid unbounded growth
      list.push({...ping, service_id: serviceId, queued_at: Date.now()});
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('[OfflineQueue] enqueue error', e.message);
    }
  }, [serviceId]);

  // Drain the queue by replaying pings to the REST endpoint
  const flush = useCallback(async () => {
    if (isFlushing.current) return;
    isFlushing.current = true;
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) return;
      const list = JSON.parse(raw);
      if (!list.length) return;

      const failed = [];
      for (const ping of list) {
        try {
          await trackingAPI.ping(ping);
        } catch (_) {
          failed.push(ping);
          break; // stop on first failure — still offline
        }
      }
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
    } catch (e) {
      console.warn('[OfflineQueue] flush error', e.message);
    } finally {
      isFlushing.current = false;
    }
  }, []);

  // Watch network state and flush when connectivity is restored
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(flush, FLUSH_DELAY);
      }
    });
    return () => {
      unsub();
      clearTimeout(flushTimer.current);
    };
  }, [flush]);

  return {enqueue, flush};
}
