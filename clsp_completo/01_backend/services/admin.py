from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin
from .models import Service, Route, Document


@admin.register(Route)
class RouteAdmin(GISModelAdmin):
    list_display  = ['id', 'created_by', 'tolerance_meters', 'created_at']
    list_filter   = ['tolerance_meters']
    raw_id_fields = ['created_by']


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display  = ['id', 'requester', 'assigned_motorizado', 'status', 'created_at']
    list_filter   = ['status']
    search_fields = ['requester__email', 'notes']
    raw_id_fields = ['requester', 'assigned_motorizado', 'approved_by']
    readonly_fields = ['created_at', 'updated_at', 'approved_at']


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display  = ['id', 'service', 'uploaded_by', 'doc_type', 'uploaded_at']
    list_filter   = ['doc_type']
    raw_id_fields = ['service', 'uploaded_by']
