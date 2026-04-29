import logging
from datetime import timedelta
from django.utils import timezone
from django.db import transaction
from django.contrib.gis.geos import GEOSGeometry
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend

from .models import Service, Route, Document, Vehicle
from .serializers import (
    ServiceListSerializer, ServiceDetailSerializer,
    ServiceCreateSerializer, ApproveServiceSerializer, DocumentSerializer,
    VehicleSerializer,
)
from .routing import get_osrm_route
from accounts.models import User
from accounts.permissions import IsAdmin, IsMotorizado, IsOwnerOrAdmin

logger = logging.getLogger(__name__)


def _notify(user, title, body):
    """Stub de notificacion push. En produccion usar firebase-admin."""
    if user and user.fcm_token:
        print(f'[FCM] → {user.email} | {title}: {body}')


class ServiceViewSet(viewsets.ModelViewSet):
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'assigned_motorizado']
    search_fields    = ['requester__email', 'requester__first_name', 'notes']
    ordering_fields  = ['created_at', 'status']
    ordering         = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        qs = Service.objects.select_related(
            'requester', 'assigned_motorizado', 'route', 'approved_by'
        ).prefetch_related('documents', 'incidents')

        if user.role == 'admin':
            return qs.all()
        elif user.role == 'motorizado':
            return qs.filter(assigned_motorizado=user)
        else:
            return qs.filter(requester=user)

    def get_serializer_class(self):
        if self.action == 'create':
            return ServiceCreateSerializer
        if self.action == 'list':
            return ServiceListSerializer
        return ServiceDetailSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [IsOwnerOrAdmin()]
        if self.action in ('approve', 'reject', 'rate'):
            return [IsAdmin()]
        if self.action in ('start', 'complete', 'upload_document'):
            return [IsMotorizado()]
        return [IsOwnerOrAdmin()]

    # ── POST /api/services/{id}/approve/ ──────────────────────────────────
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def approve(self, request, pk=None):
        service = self.get_object()

        if service.status != Service.Status.PENDING:
            return Response(
                {'error': f'Solo se pueden aprobar servicios pendientes. Estado actual: "{service.status}".'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = ApproveServiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            motorizado = User.objects.get(
                id=data['motorizado_id'], role='motorizado', is_active=True
            )
        except User.DoesNotExist:
            return Response(
                {'error': 'Motorizado no encontrado o inactivo.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # ── Generar polyline codificada via OSRM si se proporcionan waypoints ──
        encoded_polyline = ''
        polyline_steps   = []
        osrm_waypoints   = data.get('osrm_waypoints') or []

        if osrm_waypoints and len(osrm_waypoints) >= 2:
            try:
                wp_list = [(w['lat'], w['lng']) for w in osrm_waypoints]
                osrm    = get_osrm_route(wp_list)
                encoded_polyline = osrm['encoded_polyline']
                polyline_steps   = osrm['steps']
            except Exception as exc:
                logger.warning('[Approve] OSRM falló, guardando sin polyline: %s', exc)
        else:
            # Si no hay waypoints OSRM, codificar la geometría GeoJSON directamente
            try:
                from tracking.polyline_utils import encode_polyline
                geom = GEOSGeometry(str(data['route_geometry']))
                coords_raw = geom.coords  # ((lng, lat), ...)
                encoded_polyline = encode_polyline([[lat, lng] for lng, lat in coords_raw])
            except Exception as exc:
                logger.warning('[Approve] Encode polyline falló: %s', exc)

        route = Route.objects.create(
            created_by=request.user,
            geometry=GEOSGeometry(str(data['route_geometry'])),
            encoded_polyline=encoded_polyline,
            polyline_steps=polyline_steps,
            tolerance_meters=data['tolerance_meters'],
        )

        service.assigned_motorizado = motorizado
        service.route               = route
        service.status              = Service.Status.APPROVED
        service.approved_at         = timezone.now()
        service.approved_by         = request.user
        service.customer_name       = data.get('customer_name', '')
        service.customer_phone      = data.get('customer_phone', '')
        service.customer_address    = data.get('customer_address', '')
        service.stops               = data.get('stops') or []
        service.save()

        _notify(motorizado, 'Nueva tarea asignada', f'Tienes un servicio asignado. Revisa la app.')
        _notify(service.requester, 'Servicio aprobado', 'Tu solicitud fue aprobada.')
        return Response(ServiceDetailSerializer(service, context={'request': request}).data)

    # ── POST /api/services/{id}/reject/ ───────────────────────────────────
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        service = self.get_object()
        if service.status != Service.Status.PENDING:
            return Response(
                {'error': 'Solo se pueden rechazar servicios pendientes.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'error': 'El motivo del rechazo es obligatorio.'}, status=400)

        service.status = Service.Status.REJECTED
        service.notes  = f'[RECHAZADO] {reason}'
        service.save()

        _notify(service.requester, 'Servicio rechazado', reason)
        return Response({'status': 'rejected', 'reason': reason})

    # ── POST /api/services/{id}/start/ ────────────────────────────────────
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        service = self.get_object()
        if service.status != Service.Status.APPROVED:
            return Response(
                {'error': 'El servicio debe estar aprobado para iniciarse.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if service.assigned_motorizado != request.user:
            return Response({'error': 'No eres el motorizado asignado a este servicio.'}, status=403)

        service.status = Service.Status.IN_TRANSIT
        service.save()

        route_data = None
        if service.route:
            route_data = {
                'geometry':         service.route.geometry.geojson,
                'encoded_polyline': service.route.encoded_polyline,
                'polyline_steps':   service.route.polyline_steps,
                'tolerance_meters': service.route.tolerance_meters,
            }

        return Response({'status': 'in_transit', 'route': route_data})

    # ── POST /api/services/{id}/complete/ ─────────────────────────────────
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        service = self.get_object()
        if service.status != Service.Status.IN_TRANSIT:
            return Response(
                {'error': 'El servicio debe estar en transito para completarse.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        service.status = Service.Status.COMPLETED
        service.save()

        _notify(service.requester, 'Entrega completada', 'Tu servicio ha sido entregado exitosamente.')
        _notify(service.assigned_motorizado, 'Servicio completado', 'Marcaste el servicio como completado.')
        return Response({'status': 'completed'})

    # ── POST /api/services/{id}/cancel/ ───────────────────────────────────
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        service = self.get_object()
        cancellable = (Service.Status.PENDING, Service.Status.APPROVED)
        if service.status not in cancellable:
            return Response(
                {'error': 'Solo se pueden cancelar servicios pendientes o aprobados.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        # Solo el requester o el admin pueden cancelar
        if request.user.role != 'admin' and service.requester != request.user:
            return Response({'error': 'No tienes permiso para cancelar este servicio.'}, status=403)

        service.status = Service.Status.CANCELLED
        service.save()
        return Response({'status': 'cancelled'})

    # ── POST /api/services/{id}/upload_document/ ──────────────────────────
    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload_document(self, request, pk=None):
        service = self.get_object()
        active_statuses = (Service.Status.IN_TRANSIT, Service.Status.COMPLETED)
        if service.status not in active_statuses:
            return Response(
                {'error': 'Solo se pueden subir documentos en servicios activos o completados.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        file     = request.FILES.get('file')
        doc_type = request.data.get('doc_type', 'other')

        if not file:
            return Response({'error': 'Se requiere el archivo (campo "file").'}, status=400)
        allowed_ext = ('.pdf', '.jpg', '.jpeg', '.png')
        if not any(file.name.lower().endswith(ext) for ext in allowed_ext):
            return Response({'error': 'Solo se aceptan PDF, JPG o PNG.'}, status=400)
        if file.size > 10 * 1024 * 1024:
            return Response({'error': 'El archivo no puede superar 10 MB.'}, status=400)

        doc = Document.objects.create(
            service=service,
            uploaded_by=request.user,
            file=file,
            doc_type=doc_type,
            recipient_name=request.data.get('recipient_name', ''),
            recipient_phone=request.data.get('recipient_phone', ''),
            recipient_address=request.data.get('recipient_address', ''),
        )
        return Response(DocumentSerializer(doc, context={'request': request}).data, status=201)

    # ── POST /api/services/{id}/rate/ ────────────────────────────────────
    @action(detail=True, methods=['post'])
    def rate(self, request, pk=None):
        service = self.get_object()
        raw = request.data.get('rating')
        if raw is None:
            return Response({'error': 'Se requiere el campo "rating".'}, status=400)
        try:
            rating = int(raw)
        except (ValueError, TypeError):
            return Response({'error': 'El rating debe ser un número entero.'}, status=400)
        if not (0 <= rating <= 5):
            return Response({'error': 'El rating debe estar entre 0 y 5.'}, status=400)
        service.rating = rating
        service.save(update_fields=['rating'])
        return Response({'rating': service.rating})

    # ── GET /api/services/{id}/tracking_history/ ──────────────────────────
    @action(detail=True, methods=['get'], permission_classes=[IsAdmin])
    def tracking_history(self, request, pk=None):
        from tracking.models import TrackingLog
        from tracking.serializers import TrackingLogSerializer
        service = self.get_object()
        logs = TrackingLog.objects.filter(service=service).order_by('timestamp')
        return Response(TrackingLogSerializer(logs, many=True).data)

    # ── GET /api/services/dashboard/ ──────────────────────────────────────
    @action(detail=False, methods=['get'], permission_classes=[IsAdmin])
    def dashboard(self, request):
        """Resumen de estados para el panel del administrador."""
        from django.db.models import Count
        stats = Service.objects.values('status').annotate(total=Count('id'))
        result = {s['status']: s['total'] for s in stats}
        return Response({
            'pending':    result.get('pending',    0),
            'approved':   result.get('approved',   0),
            'in_transit': result.get('in_transit', 0),
            'completed':  result.get('completed',  0),
            'rejected':   result.get('rejected',   0),
            'cancelled':  result.get('cancelled',  0),
            'total':      sum(result.values()),
        })


class VehicleViewSet(viewsets.ModelViewSet):
    """CRUD de vehículos (motos). Solo accesible por administradores."""
    queryset         = Vehicle.objects.select_related('assigned_motorizado').order_by('plate')
    serializer_class = VehicleSerializer
    permission_classes = [IsAdmin]
    filter_backends  = [filters.SearchFilter, DjangoFilterBackend]
    search_fields    = ['plate', 'brand', 'model']
    filterset_fields = ['status']


class AuditLogView(APIView):
    """
    GET /api/audit/?days=7&type=all&status=all

    Solo registra eventos de modificación administrativa y errores del sistema:
    - Servicios rechazados (decisión administrativa)
    - Incidencias detectadas (errores operativos: desvíos, averías, accidentes)
    - Incidencias resueltas por admin (modificación del estado del sistema)
    NO incluye aprobaciones, completaciones ni cancelaciones normales.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        from tracking.models import Incident
        days   = int(request.query_params.get('days', 7))
        cutoff = timezone.now() - timedelta(days=days)
        logs   = []

        # ── Modificaciones administrativas: servicios rechazados ──────────────
        rejected = (
            Service.objects
            .filter(status=Service.Status.REJECTED, updated_at__gte=cutoff)
            .select_related('approved_by', 'requester')
        )
        for s in rejected:
            actor = s.approved_by
            logs.append({
                'id':        f'svc-rejected-{s.id}',
                'timestamp': s.updated_at.isoformat(),
                'type':      'service_rejected',
                'user':      actor.email if actor else 'system',
                'user_name': actor.full_name if actor else 'Sistema',
                'action':    f'Servicio #{s.number} rechazado',
                'details':   (s.notes or 'Sin motivo registrado').replace('[RECHAZADO] ', ''),
                'status':    'error',
            })

        # ── Errores del sistema: incidencias abiertas (detectadas automáticamente) ──
        open_incidents = (
            Incident.objects
            .filter(resolved=False, created_at__gte=cutoff)
            .select_related('reported_by', 'service')
        )
        for inc in open_incidents:
            is_system = inc.type in ('deviation', 'stop', 'speed')
            reporter  = inc.reported_by
            logs.append({
                'id':        f'inc-open-{inc.id}',
                'timestamp': inc.created_at.isoformat(),
                'type':      'incident_detected',
                'user':      reporter.email if reporter else 'system',
                'user_name': 'Sistema (automático)' if is_system else (reporter.full_name if reporter else 'Sistema'),
                'action':    f'Incidencia detectada: {inc.get_type_display()}',
                'details':   f'Servicio #{inc.service.number} — {inc.description[:120] if inc.description else "Sin descripción"}',
                'status':    'error',
            })

        # ── Modificaciones administrativas: incidencias resueltas por admin ───
        resolved_incidents = (
            Incident.objects
            .filter(resolved=True, created_at__gte=cutoff)
            .select_related('reported_by', 'service')
        )
        for inc in resolved_incidents:
            reporter = inc.reported_by
            logs.append({
                'id':        f'inc-resolved-{inc.id}',
                'timestamp': inc.created_at.isoformat(),
                'type':      'incident_resolved',
                'user':      reporter.email if reporter else 'system',
                'user_name': reporter.full_name if reporter else 'Sistema',
                'action':    f'Incidencia resuelta: {inc.get_type_display()}',
                'details':   f'Servicio #{inc.service.number} — {inc.description[:120] if inc.description else "—"}',
                'status':    'success',
            })

        # ── Filtros opcionales ────────────────────────────────────────────────
        filter_type   = request.query_params.get('type', 'all')
        filter_status = request.query_params.get('status', 'all')
        if filter_type != 'all':
            logs = [l for l in logs if l['type'] == filter_type]
        if filter_status != 'all':
            logs = [l for l in logs if l['status'] == filter_status]

        logs.sort(key=lambda x: x['timestamp'], reverse=True)
        return Response(logs)
