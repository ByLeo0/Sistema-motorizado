from rest_framework import serializers
from .models import TrackingLog, Incident


class TrackingLogSerializer(serializers.ModelSerializer):
    lat = serializers.ReadOnlyField()
    lng = serializers.ReadOnlyField()

    class Meta:
        model  = TrackingLog
        fields = [
            'id', 'service', 'lat', 'lng', 'speed_kmh', 'heading',
            'accuracy_meters', 'deviation_meters', 'is_deviated', 'timestamp',
        ]
        read_only_fields = fields


class TrackingPingSerializer(serializers.Serializer):
    """Lo que envia la app movil del motorizado."""
    lat      = serializers.FloatField(min_value=-90,  max_value=90)
    lng      = serializers.FloatField(min_value=-180, max_value=180)
    speed    = serializers.FloatField(default=0.0,    min_value=0)
    heading  = serializers.FloatField(default=0.0,    min_value=0,  max_value=360)
    accuracy = serializers.FloatField(default=0.0,    min_value=0)


class IncidentSerializer(serializers.ModelSerializer):
    photo_url       = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()
    service_number  = serializers.SerializerMethodField()

    class Meta:
        model  = Incident
        fields = [
            'id', 'service', 'service_number', 'type', 'description', 'photo', 'photo_url',
            'resolved', 'admin_comment', 'resolved_by', 'resolved_by_name', 'resolved_at',
            'reported_by', 'created_at',
        ]
        read_only_fields = [
            'id', 'created_at', 'resolved', 'reported_by', 'photo_url',
            'resolved_by', 'resolved_by_name', 'resolved_at', 'service_number',
        ]
        extra_kwargs = {'photo': {'write_only': True, 'required': False}}

    def get_photo_url(self, obj):
        request = self.context.get('request')
        if obj.photo and request:
            return request.build_absolute_uri(obj.photo.url)
        return None

    def get_resolved_by_name(self, obj):
        return obj.resolved_by.full_name if obj.resolved_by else None

    def get_service_number(self, obj):
        return obj.service.number if obj.service else None


class RoutePublicSerializer(serializers.Serializer):
    """Respuesta al motorizado cuando inicia un servicio."""
    geometry         = serializers.CharField()
    encoded_polyline = serializers.CharField()
    polyline_steps   = serializers.ListField()
    tolerance_meters = serializers.FloatField()
