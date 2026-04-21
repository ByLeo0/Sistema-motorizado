# tracking/consumers.py — ARCHIVO NUEVO
"""
WebSocket Consumer para rastreo GPS en tiempo real.

Flujo:
  1. El motorizado conecta al canal del servicio y envia pings cada 5s.
  2. El backend calcula el desvio con PostGIS.
  3. El backend hace broadcast al grupo: admin en el panel recibe el ping
     y actualiza el marcador en el mapa sin refrescar la pagina.
"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser


class TrackingConsumer(AsyncWebsocketConsumer):

    # ── Conexion ──────────────────────────────────────────────────────────
    async def connect(self):
        self.service_id = self.scope['url_route']['kwargs']['service_id']
        self.group_name = f'tracking_{self.service_id}'
        user            = self.scope.get('user', AnonymousUser())

        # Rechazar conexiones sin autenticacion
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        # Solo admin y motorizado pueden conectarse al canal de tracking
        if user.role not in ('admin', 'motorizado'):
            await self.close(code=4003)
            return

        self.user = user

        # Unirse al grupo del canal (un grupo por servicio)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Confirmar conexion al cliente
        await self.send(text_data=json.dumps({
            'type':       'connection_established',
            'service_id': self.service_id,
            'user_role':  user.role,
            'message':    'Conectado al canal de rastreo.',
        }))

    # ── Desconexion ───────────────────────────────────────────────────────
    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # ── Recibir mensaje del cliente ───────────────────────────────────────
    async def receive(self, text_data):
        """
        Solo el motorizado envia mensajes. El admin solo escucha.
        Payload esperado:
          { "lat": -12.04, "lng": -77.03, "speed": 35.5, "heading": 180, "accuracy": 5.0 }
        """
        if self.user.role != 'motorizado':
            return  # Admin no puede enviar pings

        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, ValueError):
            await self.send(text_data=json.dumps({'type': 'error', 'message': 'JSON invalido.'}))
            return

        # Validar campos minimos
        lat = data.get('lat')
        lng = data.get('lng')
        if lat is None or lng is None:
            await self.send(text_data=json.dumps({'type': 'error', 'message': 'lat y lng son requeridos.'}))
            return

        # Procesar en la DB (operacion sincrona → async wrapper)
        result = await self._save_ping(
            lat=float(lat),
            lng=float(lng),
            speed=float(data.get('speed', 0)),
            heading=float(data.get('heading', 0)),
            accuracy=float(data.get('accuracy', 0)),
        )

        if 'error' in result:
            await self.send(text_data=json.dumps({'type': 'error', 'message': result['error']}))
            return

        # Broadcast a todo el grupo (admin + el propio motorizado)
        await self.channel_layer.group_send(
            self.group_name,
            {
                'type':             'tracking.update',  # → llama al metodo tracking_update
                'lat':               lat,
                'lng':               lng,
                'speed_kmh':         float(data.get('speed', 0)),
                'heading':           float(data.get('heading', 0)),
                'deviation_meters':  result['deviation_meters'],
                'is_deviated':       result['is_deviated'],
                'tolerance_meters':  result['tolerance_meters'],
                'motorizado_name':   self.user.full_name,
                'timestamp':         result['timestamp'],
            }
        )

        # Confirmar al motorizado que el ping fue procesado
        await self.send(text_data=json.dumps({
            'type':             'ping_ack',
            'deviation_meters': result['deviation_meters'],
            'is_deviated':      result['is_deviated'],
        }))

    # ── Handler: reenviar update a todos los miembros del grupo ──────────
    async def tracking_update(self, event):
        """Channels llama este metodo cuando alguien hace group_send con type='tracking.update'"""
        await self.send(text_data=json.dumps({
            'type':             'tracking_update',
            'lat':               event['lat'],
            'lng':               event['lng'],
            'speed_kmh':         event['speed_kmh'],
            'heading':           event['heading'],
            'deviation_meters':  event['deviation_meters'],
            'is_deviated':       event['is_deviated'],
            'tolerance_meters':  event['tolerance_meters'],
            'motorizado_name':   event['motorizado_name'],
            'timestamp':         event['timestamp'],
        }))

    # ── Helper DB (sync → async) ─────────────────────────────────────────
    @database_sync_to_async
    def _save_ping(self, lat, lng, speed, heading, accuracy):
        from services.models import Service
        from tracking.geofence import save_tracking_ping

        try:
            service = Service.objects.select_related('route').get(
                id=self.service_id,
                assigned_motorizado=self.user,
                status=Service.Status.IN_TRANSIT,
            )
        except Service.DoesNotExist:
            return {'error': 'Servicio no encontrado o no esta en transito.'}

        log, deviation_info = save_tracking_ping(
            service=service,
            motorizado=self.user,
            lat=lat,
            lng=lng,
            speed=speed,
            heading=heading,
            accuracy=accuracy,
        )
        return {**deviation_info, 'timestamp': log.timestamp.isoformat()}
