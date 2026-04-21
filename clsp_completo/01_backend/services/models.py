import uuid
from django.contrib.gis.db import models as gis_models
from django.db import models
from django.conf import settings


class Route(models.Model):
    """Ruta fija definida por el administrador. El motorizado no puede modificarla."""
    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_by       = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='routes_created'
    )
    geometry         = gis_models.LineStringField(srid=4326,
                        help_text='Trayectoria fija en formato LineString (GeoJSON)')
    tolerance_meters = models.FloatField(default=100.0,
                        help_text='Metros maximos que puede desviarse el motorizado')
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table     = 'routes'
        verbose_name = 'Ruta'

    def __str__(self):
        return f'Ruta {self.id} ({self.tolerance_meters}m tolerancia)'


class Service(models.Model):
    class Status(models.TextChoices):
        PENDING    = 'pending',    'Pendiente de aprobacion'
        APPROVED   = 'approved',   'Aprobado'
        IN_TRANSIT = 'in_transit', 'En transito'
        COMPLETED  = 'completed',  'Completado'
        REJECTED   = 'rejected',   'Rechazado'
        CANCELLED  = 'cancelled',  'Cancelado'

    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number              = models.PositiveIntegerField(unique=True, null=True, blank=True, editable=False,
                            help_text='Numero correlativo auto-asignado al crear el servicio')
    requester           = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='services_requested'
    )
    assigned_motorizado = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='services_assigned'
    )
    route               = models.OneToOneField(
        Route, on_delete=models.SET_NULL, null=True, blank=True
    )
    status              = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    origin              = gis_models.PointField(srid=4326, help_text='Punto de recogida')
    destination         = gis_models.PointField(srid=4326, help_text='Punto de entrega')
    notes               = models.TextField(blank=True, help_text='Instrucciones adicionales')
    approved_by         = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='services_approved'
    )
    approved_at         = models.DateTimeField(null=True, blank=True)
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    class Meta:
        db_table     = 'services'
        ordering     = ['-created_at']
        verbose_name = 'Servicio'
        verbose_name_plural = 'Servicios'

    def save(self, *args, **kwargs):
        if not self.number:
            last = Service.objects.order_by('-number').filter(number__isnull=False).first()
            self.number = (last.number + 1) if last else 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f'Servicio #{self.number} [{self.status}]'


class Document(models.Model):
    class DocType(models.TextChoices):
        DELIVERY_NOTE = 'delivery_note', 'Guia de remision'
        INVOICE       = 'invoice',       'Factura'
        RECEIPT       = 'receipt',       'Recibo de conformidad'
        OTHER         = 'other',         'Otro'

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service     = models.ForeignKey(Service, on_delete=models.CASCADE, related_name='documents')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT
    )
    file              = models.FileField(upload_to='documents/%Y/%m/', blank=True)
    file_url          = models.URLField(blank=True, help_text='URL en S3 (produccion)')
    doc_type          = models.CharField(max_length=30, choices=DocType.choices, default=DocType.OTHER)
    recipient_name    = models.CharField(max_length=200, blank=True, help_text='Nombre del destinatario')
    recipient_phone   = models.CharField(max_length=20,  blank=True, help_text='Telefono del destinatario')
    recipient_address = models.CharField(max_length=255, blank=True, help_text='Direccion del destinatario')
    uploaded_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table     = 'documents'
        ordering     = ['-uploaded_at']
        verbose_name = 'Documento'

    def get_url(self):
        """Devuelve la URL correcta segun el entorno."""
        return self.file_url or (self.file.url if self.file else '')
