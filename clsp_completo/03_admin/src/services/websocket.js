/**
 * WebSocket para el admin: se conecta al canal de un servicio
 * y recibe los pings GPS del motorizado en tiempo real.
 * El admin solo escucha — no envía pings.
 */

const WS_BASE = `ws://${window.location.host}`;

class AdminTrackingSocket {
  constructor() {
    this.ws          = null;
    this.serviceId   = null;
    this.retries     = 0;
    this.maxRetries  = 8;
    this.retryDelay  = 3000;
    this.timer       = null;
    this.isClosed    = false;

    this.onUpdate     = null; // ({lat, lng, speed_kmh, deviation_meters, is_deviated, ...}) => void
    this.onDeviation  = null; // (msg) => void  — llamado solo cuando is_deviated === true
    this.onStatus     = null; // ('connected' | 'disconnected' | 'error') => void
  }

  connect(serviceId) {
    this.serviceId = serviceId;
    this.isClosed  = false;
    const token    = localStorage.getItem('access_token');
    if (!token) { this.onStatus?.('error'); return; }

    const url = `${WS_BASE}/ws/tracking/${serviceId}/?token=${token}`;
    this.ws   = new WebSocket(url);

    this.ws.onopen = () => {
      this.retries = 0;
      this.onStatus?.('connected');
    };

    this.ws.onmessage = ({data}) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'tracking_update') {
          this.onUpdate?.(msg);
          if (msg.is_deviated) this.onDeviation?.(msg);
        }
      } catch (_) {}
    };

    this.ws.onerror = () => this.onStatus?.('error');

    this.ws.onclose = () => {
      this.onStatus?.('disconnected');
      if (!this.isClosed && this.retries < this.maxRetries) {
        this.retries++;
        this.timer = setTimeout(() => this.connect(this.serviceId), this.retryDelay);
      }
    };
  }

  disconnect() {
    this.isClosed = true;
    clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton — una conexión activa a la vez
export const adminWS = new AdminTrackingSocket();
export default adminWS;
