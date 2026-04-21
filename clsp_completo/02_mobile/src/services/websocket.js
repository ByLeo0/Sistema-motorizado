/**
 * Servicio de WebSocket para rastreo GPS en tiempo real.
 * Se conecta al canal del servicio y maneja reconexion automatica.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {WS_URL} from './api';

const RECONNECT_DELAY = 3000; // ms entre intentos de reconexion
const MAX_RECONNECTS  = 10;

class TrackingWebSocket {
  constructor() {
    this.ws             = null;
    this.serviceId      = null;
    this.reconnectCount = 0;
    this.reconnectTimer = null;
    this.isManualClose  = false;

    // Callbacks configurables
    this.onTrackingUpdate  = null; // recibe el ping procesado
    this.onDeviation       = null; // alerta de desvio
    this.onConnectionChange = null; // true/false
    this.onError           = null;
  }

  async connect(serviceId) {
    this.serviceId     = serviceId;
    this.isManualClose = false;

    const token = await AsyncStorage.getItem('access_token');
    if (!token) {
      this.onError?.('No hay token de autenticacion.');
      return;
    }

    const url = `${WS_URL}/ws/tracking/${serviceId}/?token=${token}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectCount = 0;
      this.onConnectionChange?.(true);
      console.log('[WS] Conectado al canal de tracking:', serviceId);
    };

    this.ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);
        this._handleMessage(msg);
      } catch (e) {
        console.warn('[WS] Mensaje invalido:', event.data);
      }
    };

    this.ws.onerror = err => {
      console.error('[WS] Error:', err.message);
      this.onError?.(err.message);
    };

    this.ws.onclose = event => {
      this.onConnectionChange?.(false);
      console.log('[WS] Desconectado. Codigo:', event.code);

      if (!this.isManualClose && this.reconnectCount < MAX_RECONNECTS) {
        this.reconnectCount++;
        console.log(`[WS] Reconectando en ${RECONNECT_DELAY}ms... (intento ${this.reconnectCount})`);
        this.reconnectTimer = setTimeout(() => this.connect(this.serviceId), RECONNECT_DELAY);
      }
    };
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'connection_established':
        console.log('[WS] Handshake OK:', msg.message);
        break;

      case 'tracking_update':
        this.onTrackingUpdate?.(msg);
        if (msg.is_deviated) {
          this.onDeviation?.(msg);
        }
        break;

      case 'ping_ack':
        // Confirmacion del backend de que el ping fue guardado
        break;

      case 'error':
        this.onError?.(msg.message);
        break;

      default:
        break;
    }
  }

  // Envia un ping GPS al backend
  sendPing({lat, lng, speed = 0, heading = 0, accuracy = 0}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({lat, lng, speed, heading, accuracy}));
      return true;
    }
    return false;
  }

  disconnect() {
    this.isManualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onConnectionChange?.(false);
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton — una sola instancia en toda la app
export const trackingWS = new TrackingWebSocket();
export default trackingWS;
