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
from .geofence import save_tracking_ping
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
            'log_id':          str(log.id),
            'deviation_meters': deviation_info['deviation_meters'],
            'is_deviated':      deviation_info['is_deviated'],
            'tolerance_meters': deviation_info['tolerance_meters'],
            'timestamp':        log.timestamp.isoformat(),
        }, status=201)


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
        if self.action in ('list', 'retrieve', 'resolve'):
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
        incident.resolved = True
        incident.save(update_fields=['resolved'])
        return Response({'detail': 'Incidencia marcada como resuelta.', 'resolved': True})
