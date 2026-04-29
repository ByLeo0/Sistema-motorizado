from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Count, Min, Max
from django.db.models.functions import TruncDate
from datetime import timedelta

from .models import TrackingLog, Incident
from .serializers import TrackingLogSerializer, TrackingPingSerializer, IncidentSerializer
from .geofence import save_tracking_ping, snap_to_route
from services.models import Service
from accounts.permissions import IsAdmin, IsMotorizado


class TrackingPingView(APIView):
    """
    POST /api/tracking/ping/
    El motorizado envia su ubicacion cada N segundos desde la app movil.
    El backend calcula el desvio y crea incidencias si corresponde.

    Body: { "service_id": "uuid", "lat": -12.04, "lng": -77.03, "speed": 35.5 }
    """
    permission_classes = [IsMotorizado]

    def post(self, request):
        service_id = request.data.get('service_id')
        if not service_id:
            return Response({'error': 'service_id es requerido.'}, status=400)

        try:
            service = Service.objects.select_related('route').get(
                id=service_id,
                assigned_motorizado=request.user,
                status=Service.Status.IN_TRANSIT,
            )
        except Service.DoesNotExist:
            return Response(
                {'error': 'Servicio no encontrado, no asignado a ti, o no esta en transito.'},
                status=404
            )

        serializer = TrackingPingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        log, deviation_info = save_tracking_ping(
            service=service,
            motorizado=request.user,
            lat=d['lat'],
            lng=d['lng'],
            speed=d['speed'],
            heading=d['heading'],
            accuracy=d['accuracy'],
        )

        return Response({
            'log_id':           str(log.id),
            'deviation_meters': deviation_info['deviation_meters'],
            'is_deviated':      deviation_info['is_deviated'],
            'tolerance_meters': deviation_info['tolerance_meters'],
            'route_status':     deviation_info['route_status'],
            'snapped_lat':      deviation_info['snapped_lat'],
            'snapped_lng':      deviation_info['snapped_lng'],
            'reentry_lat':      deviation_info['reentry_lat'],
            'reentry_lng':      deviation_info['reentry_lng'],
            'timestamp':        log.timestamp.isoformat(),
        }, status=201)


class SnapView(APIView):
    """
    POST /api/tracking/snap/
    Snap de un punto GPS al eje de la ruta, sin escribir en la base de datos.

    Body: { "service_id": "uuid", "lat": -12.04, "lng": -77.03 }

    Respuesta:
      route_status   'EN_RUTA' | 'DESVIADO'
      distance_m     distancia perpendicular al eje (metros)
      snapped_lat    coordenada snapped
      snapped_lng
      reentry_lat    punto de reingreso más cercano (mismo que snapped por ahora)
      reentry_lng
    """
    permission_classes = [IsMotorizado]

    def post(self, request):
        service_id = request.data.get('service_id')
        lat = request.data.get('lat')
        lng = request.data.get('lng')

        if not service_id or lat is None or lng is None:
            return Response({'error': 'service_id, lat y lng son requeridos.'}, status=400)

        try:
            lat = float(lat)
            lng = float(lng)
        except (TypeError, ValueError):
            return Response({'error': 'lat y lng deben ser números.'}, status=400)

        try:
            service = Service.objects.select_related('route').get(
                id=service_id,
                assigned_motorizado=request.user,
                status=Service.Status.IN_TRANSIT,
            )
        except Service.DoesNotExist:
            return Response(
                {'error': 'Servicio no encontrado, no asignado a ti, o no en tránsito.'},
                status=404,
            )

        if not service.route:
            return Response({'error': 'El servicio no tiene ruta asignada.'}, status=400)

        snap = snap_to_route(service.route, lat, lng)
        is_deviated = snap['distance_m'] > service.route.tolerance_meters

        return Response({
            'route_status':     'DESVIADO' if is_deviated else 'EN_RUTA',
            'distance_m':       snap['distance_m'],
            'snapped_lat':      snap['snapped_lat'],
            'snapped_lng':      snap['snapped_lng'],
            'reentry_lat':      snap['reentry_lat'],
            'reentry_lng':      snap['reentry_lng'],
            'tolerance_meters': service.route.tolerance_meters,
        })


class StatsView(APIView):
    """
    GET /api/tracking/stats/
    Entregas por día, tiempo promedio de servicio y horas por motorizado.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        since = timezone.now() - timedelta(days=days)

        # Entregas completadas por día
        daily = (
            Service.objects
            .filter(status='completed', updated_at__gte=since)
            .annotate(date=TruncDate('updated_at'))
            .values('date')
            .annotate(count=Count('id'))
            .order_by('date')
        )

        # Tiempo promedio de servicio (aprobación → completado, en minutos)
        completed = Service.objects.filter(status='completed', approved_at__isnull=False)
        durations = []
        for s in completed:
            delta = (s.updated_at - s.approved_at).total_seconds() / 60
            if 0 < delta < 1440:   # ignorar outliers > 24h
                durations.append(delta)
        avg_minutes = round(sum(durations) / len(durations), 1) if durations else None

        # Horas trabajadas por motorizado (basado en TrackingLog)
        moto_data = {}
        logs_by_service = (
            TrackingLog.objects
            .filter(service__status='completed')
            .values('service_id', 'service__assigned_motorizado_id',
                    'service__assigned_motorizado__first_name',
                    'service__assigned_motorizado__last_name')
            .annotate(first=Min('timestamp'), last=Max('timestamp'))
        )
        for row in logs_by_service:
            mid = str(row['service__assigned_motorizado_id'])
            if not mid:
                continue
            name = f"{row['service__assigned_motorizado__first_name']} {row['service__assigned_motorizado__last_name']}"
            secs = (row['last'] - row['first']).total_seconds()
            if mid not in moto_data:
                moto_data[mid] = {'name': name, 'seconds': 0, 'deliveries': 0}
            moto_data[mid]['seconds']   += secs
            moto_data[mid]['deliveries'] += 1

        moto_hours = sorted([
            {
                'motorizado_id': mid,
                'name':       v['name'],
                'hours':      round(v['seconds'] / 3600, 1),
                'deliveries': v['deliveries'],
            }
            for mid, v in moto_data.items()
        ], key=lambda x: x['hours'], reverse=True)

        return Response({
            'daily_deliveries': [
                {'date': str(d['date']), 'count': d['count']} for d in daily
            ],
            'avg_service_minutes': avg_minutes,
            'motorizado_hours': moto_hours,
        })


class ActiveMotorizadosView(APIView):
    """
    GET /api/tracking/active/
    Devuelve la ultima posicion GPS de cada motorizado con un servicio en_transito.
    Usado por el panel admin para mostrar todos los motorizados en el mapa en vivo.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        in_transit = Service.objects.filter(
            status=Service.Status.IN_TRANSIT,
            assigned_motorizado__isnull=False,
        ).select_related('assigned_motorizado', 'route')

        result = []
        for service in in_transit:
            last_log = (
                TrackingLog.objects
                .filter(service=service)
                .order_by('-timestamp')
                .first()
            )
            result.append({
                'service_id':       str(service.id),
                'service_number':   service.number,
                'motorizado_id':    str(service.assigned_motorizado.id),
                'motorizado_name':  service.assigned_motorizado.full_name,
                'lat':              last_log.lat if last_log else None,
                'lng':              last_log.lng if last_log else None,
                'speed_kmh':        last_log.speed_kmh if last_log else None,
                'deviation_meters': last_log.deviation_meters if last_log else None,
                'is_deviated':      last_log.is_deviated if last_log else False,
                'timestamp':        last_log.timestamp.isoformat() if last_log else None,
            })

        return Response(result)


class IncidentViewSet(viewsets.ModelViewSet):
    """
    GET  /api/incidents/               — admin: todas; motorizado: solo las suyas
    POST /api/incidents/               — motorizado crea incidencia manual
    GET  /api/incidents/{id}/          — detalle
    GET  /api/incidents/my_incidents/  — incidencias del motorizado autenticado
    PATCH /api/incidents/{id}/resolve/ — admin marca como resuelta
    """
    serializer_class  = IncidentSerializer
    filterset_fields  = ['service', 'type', 'resolved']
    ordering          = ['-created_at']
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'resolve', 'reassign', 'cancel_service'):
            return [IsAdmin()]
        if self.action in ('create', 'my_incidents'):
            return [IsMotorizado()]
        return [IsAdmin()]

    def get_queryset(self):
        user = self.request.user
        qs = Incident.objects.select_related('service', 'tracking_log', 'reported_by')
        if hasattr(user, 'role') and user.role == 'motorizado':
            return qs.filter(reported_by=user)
        return qs.all()

    def perform_create(self, serializer):
        serializer.save(reported_by=self.request.user)

    @action(detail=False, methods=['get'], permission_classes=[IsMotorizado])
    def my_incidents(self, request):
        """GET /api/incidents/my_incidents/ — incidencias del motorizado autenticado."""
        qs = Incident.objects.filter(reported_by=request.user).order_by('-created_at')
        return Response(IncidentSerializer(qs, many=True, context={'request': request}).data)

    @action(detail=True, methods=['patch'], permission_classes=[IsAdmin])
    def resolve(self, request, pk=None):
        incident = self.get_object()
        if incident.resolved:
            return Response({'error': 'La incidencia ya está resuelta.'}, status=400)
        comment = request.data.get('admin_comment', '').strip()
        incident.resolved     = True
        incident.admin_comment = comment
        incident.resolved_by  = request.user
        incident.resolved_at  = timezone.now()
        incident.save(update_fields=['resolved', 'admin_comment', 'resolved_by', 'resolved_at'])
        from services.views import _notify
        if incident.reported_by:
            _notify(incident.reported_by, 'Incidencia resuelta', comment or 'El administrador marcó tu incidencia como resuelta.')
        return Response(IncidentSerializer(incident, context={'request': request}).data)

    @action(detail=True, methods=['patch'], permission_classes=[IsAdmin])
    def reassign(self, request, pk=None):
        """Reasigna el servicio de la incidencia a otro motorizado."""
        from services.models import Service
        from accounts.models import User as UserModel
        incident = self.get_object()
        motorizado_id = request.data.get('motorizado_id', '').strip()
        comment = request.data.get('admin_comment', '').strip()
        if not motorizado_id:
            return Response({'error': 'motorizado_id es requerido.'}, status=400)
        try:
            nuevo = UserModel.objects.get(id=motorizado_id, role='motorizado', is_active=True)
        except UserModel.DoesNotExist:
            return Response({'error': 'Motorizado no encontrado o inactivo.'}, status=404)
        service = incident.service
        if service.status not in (Service.Status.APPROVED, Service.Status.IN_TRANSIT):
            return Response({'error': 'Solo se puede reasignar un servicio aprobado o en tránsito.'}, status=400)
        anterior = service.assigned_motorizado
        service.assigned_motorizado = nuevo
        service.save(update_fields=['assigned_motorizado'])
        incident.resolved      = True
        incident.admin_comment = comment or f'Servicio reasignado a {nuevo.full_name}.'
        incident.resolved_by   = request.user
        incident.resolved_at   = timezone.now()
        incident.save(update_fields=['resolved', 'admin_comment', 'resolved_by', 'resolved_at'])
        from services.views import _notify
        if anterior:
            _notify(anterior, 'Servicio reasignado', f'El servicio #{service.number} fue reasignado a otro motorizado.')
        _notify(nuevo, 'Nueva tarea asignada', f'Se te asignó el servicio #{service.number}.')
        return Response(IncidentSerializer(incident, context={'request': request}).data)

    @action(detail=True, methods=['patch'], permission_classes=[IsAdmin])
    def cancel_service(self, request, pk=None):
        """Cancela el servicio asociado a la incidencia."""
        from services.models import Service
        incident = self.get_object()
        comment = request.data.get('admin_comment', '').strip()
        service = incident.service
        cancellable = (Service.Status.PENDING, Service.Status.APPROVED, Service.Status.IN_TRANSIT)
        if service.status not in cancellable:
            return Response({'error': 'El servicio no puede cancelarse en su estado actual.'}, status=400)
        service.status = Service.Status.CANCELLED
        service.save(update_fields=['status'])
        incident.resolved      = True
        incident.admin_comment = comment or 'Servicio cancelado por el administrador.'
        incident.resolved_by   = request.user
        incident.resolved_at   = timezone.now()
        incident.save(update_fields=['resolved', 'admin_comment', 'resolved_by', 'resolved_at'])
        from services.views import _notify
        if incident.reported_by:
            _notify(incident.reported_by, 'Servicio cancelado', incident.admin_comment)
        if service.requester:
            _notify(service.requester, 'Servicio cancelado', incident.admin_comment)
        return Response(IncidentSerializer(incident, context={'request': request}).data)
