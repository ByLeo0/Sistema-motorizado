import uuid
from django.contrib.gis.db import models as gis_models
from django.db import models
from django.conf import settings


class TrackingLog(models.Model):
    """Registro inmutable de cada ping GPS enviado por el motorizado."""
    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service          = models.ForeignKey(
        'services.Service', on_delete=models.CASCADE, related_name='tracking_logs'
    )
    motorizado       = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='tracking_logs'
    )
    location         = gis_models.PointField(srid=4326, help_text='Coordenada GPS (lng, lat)')
    speed_kmh        = models.FloatField(default=0.0, help_text='Velocidad en km/h')
    heading          = models.FloatField(default=0.0, help_text='Direccion en grados (0-360)')
    accuracy_meters  = models.FloatField(default=0.0, help_text='Precision del GPS en metros')
    deviation_meters = models.FloatField(default=0.0, help_text='Distancia a la ruta fija')
    is_deviated      = models.BooleanField(default=False, help_text='True si supera la tolerancia')
    timestamp        = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table     = 'tracking_logs'
        ordering     = ['-timestamp']
        indexes      = [models.Index(fields=['service', 'timestamp'])]
        verbose_name = 'Log de rastreo'

    def __str__(self):
        return f'Log {self.service_id} @ {self.timestamp:%H:%M:%S} — desv: {self.deviation_meters:.0f}m'

    @property
    def lat(self):
        return self.location.y

    @property
    def lng(self):
        return self.location.x


class Incident(models.Model):
    class Type(models.TextChoices):
        DEVIATION = 'deviation', 'Desvio de ruta'
        STOP      = 'stop',      'Detencion prolongada'
        SPEED     = 'speed',     'Velocidad excesiva'
        MANUAL    = 'manual',    'Reporte manual'
        ACCIDENT  = 'accident',  'Accidente'
        BREAKDOWN = 'breakdown', 'Averia del vehiculo'
        TRAFFIC   = 'traffic',   'Trafico / Congestion'

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service      = models.ForeignKey(
        'services.Service', on_delete=models.CASCADE, related_name='incidents'
    )
    reported_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='incidents_reported'
    )
    tracking_log = models.ForeignKey(
        TrackingLog, on_delete=models.SET_NULL, null=True, blank=True
    )
    type          = models.CharField(max_length=30, choices=Type.choices, db_index=True)
    description   = models.TextField(blank=True)
    photo         = models.ImageField(upload_to='incidents/%Y/%m/', blank=True, null=True)
    resolved      = models.BooleanField(default=False)
    admin_comment = models.TextField(blank=True, help_text='Respuesta del administrador al motorizado')
    resolved_by   = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='incidents_resolved'
    )
    resolved_at   = models.DateTimeField(null=True, blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table     = 'incidents'
        ordering     = ['-created_at']
        verbose_name = 'Incidencia'

    def __str__(self):
        return f'{self.type} — Servicio {self.service_id}'
