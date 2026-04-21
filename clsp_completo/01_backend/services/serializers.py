from rest_framework import serializers
from django.contrib.gis.geos import Point, GEOSGeometry
from .models import Service, Route, Document
from accounts.serializers import UserSerializer


class RouteSerializer(serializers.ModelSerializer):
    geometry = serializers.JSONField(help_text='LineString en formato GeoJSON')

    class Meta:
        model  = Route
        fields = ['id', 'geometry', 'tolerance_meters', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_geometry(self, value):
        try:
            geom = GEOSGeometry(str(value))
            if geom.geom_type != 'LineString':
                raise serializers.ValidationError('La geometria debe ser un LineString.')
            if len(geom.coords) < 2:
                raise serializers.ValidationError('La ruta debe tener al menos 2 puntos.')
            return geom
        except (ValueError, TypeError):
            raise serializers.ValidationError('GeoJSON invalido. Ejemplo: {"type":"LineString","coordinates":[[-77.03,-12.04],[-77.01,-12.02]]}')


class DocumentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model  = Document
        fields = [
            'id', 'doc_type', 'url',
            'recipient_name', 'recipient_phone', 'recipient_address',
            'uploaded_at',
        ]
        read_only_fields = ['id', 'url', 'uploaded_at']

    def get_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file_url


class ServiceListSerializer(serializers.ModelSerializer):
    requester_name    = serializers.CharField(source='requester.full_name',           read_only=True)
    motorizado_name   = serializers.CharField(source='assigned_motorizado.full_name', read_only=True)
    origin_lat        = serializers.SerializerMethodField()
    origin_lng        = serializers.SerializerMethodField()
    destination_lat   = serializers.SerializerMethodField()
    destination_lng   = serializers.SerializerMethodField()
    incidents_count   = serializers.IntegerField(source='incidents.count',            read_only=True)
    documents_count   = serializers.IntegerField(source='documents.count',            read_only=True)

    class Meta:
        model  = Service
        fields = [
            'id', 'number', 'status', 'requester_name', 'motorizado_name',
            'origin_lat', 'origin_lng', 'destination_lat', 'destination_lng',
            'notes', 'incidents_count', 'documents_count', 'created_at',
        ]

    def get_origin_lat(self, obj):      return obj.origin.y
    def get_origin_lng(self, obj):      return obj.origin.x
    def get_destination_lat(self, obj): return obj.destination.y
    def get_destination_lng(self, obj): return obj.destination.x


class ServiceDetailSerializer(ServiceListSerializer):
    requester           = UserSerializer(read_only=True)
    assigned_motorizado = UserSerializer(read_only=True)
    approved_by         = UserSerializer(read_only=True)
    route               = RouteSerializer(read_only=True)
    documents           = DocumentSerializer(many=True, read_only=True)

    class Meta(ServiceListSerializer.Meta):
        fields = ServiceListSerializer.Meta.fields + [
            'requester', 'assigned_motorizado', 'approved_by',
            'route', 'documents', 'approved_at', 'updated_at',
        ]


class ServiceCreateSerializer(serializers.ModelSerializer):
    origin_lat      = serializers.FloatField(write_only=True, help_text='Latitud del origen')
    origin_lng      = serializers.FloatField(write_only=True, help_text='Longitud del origen')
    destination_lat = serializers.FloatField(write_only=True, help_text='Latitud del destino')
    destination_lng = serializers.FloatField(write_only=True, help_text='Longitud del destino')

    class Meta:
        model  = Service
        fields = ['origin_lat', 'origin_lng', 'destination_lat', 'destination_lng', 'notes']

    def validate(self, attrs):
        lat = attrs.get('origin_lat')
        lng = attrs.get('origin_lng')
        if not (-90 <= lat <= 90):
            raise serializers.ValidationError({'origin_lat': 'Latitud fuera de rango (-90 a 90).'})
        if not (-180 <= lng <= 180):
            raise serializers.ValidationError({'origin_lng': 'Longitud fuera de rango (-180 a 180).'})
        return attrs

    def create(self, validated_data):
        origin      = Point(validated_data.pop('origin_lng'),      validated_data.pop('origin_lat'),      srid=4326)
        destination = Point(validated_data.pop('destination_lng'),  validated_data.pop('destination_lat'), srid=4326)
        return Service.objects.create(
            requester=self.context['request'].user,
            origin=origin,
            destination=destination,
            **validated_data
        )


class ApproveServiceSerializer(serializers.Serializer):
    motorizado_id    = serializers.UUIDField(help_text='UUID del motorizado asignado')
    route_geometry   = serializers.JSONField(help_text='LineString GeoJSON de la ruta fija')
    tolerance_meters = serializers.FloatField(default=100.0, min_value=10.0, max_value=5000.0)
