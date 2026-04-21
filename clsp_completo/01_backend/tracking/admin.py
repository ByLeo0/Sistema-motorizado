from django.contrib import admin
from .models import TrackingLog, Incident


@admin.register(TrackingLog)
class TrackingLogAdmin(admin.ModelAdmin):
    list_display  = ['id', 'service', 'motorizado', 'deviation_meters', 'is_deviated', 'timestamp']
    list_filter   = ['is_deviated']
    raw_id_fields = ['service', 'motorizado']
    readonly_fields = ['timestamp']


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display  = ['id', 'service', 'type', 'resolved', 'created_at']
    list_filter   = ['type', 'resolved']
    raw_id_fields = ['service', 'tracking_log']
    readonly_fields = ['created_at']
