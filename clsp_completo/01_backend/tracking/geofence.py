"""
Logica de geofencing lineal usando PostGIS.
Calcula la distancia del motorizado a la ruta fija y genera incidencias automaticas.
"""
from django.contrib.gis.geos import Point
from django.db import connection
from django.utils import timezone
from datetime import timedelta


def calculate_deviation(route_geometry, lat: float, lng: float) -> float:
    """
    Calcula la distancia minima (en metros) desde el punto actual hasta
    la ruta fija usando la funcion ST_Distance de PostGIS.
    Transforma ambas geometrias a SRID 3857 (metros reales) para precision.
    """
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT ST_Distance(
                ST_Transform(ST_SetSRID(ST_MakePoint(%s, %s), 4326), 3857),
                ST_Transform(ST_SetSRID(%s::geometry, 4326), 3857)
            )
        """, [lng, lat, route_geometry.wkt])
        row = cursor.fetchone()
    return round(row[0], 2) if row else 0.0


def save_tracking_ping(service, motorizado, lat: float, lng: float,
                        speed: float = 0.0, heading: float = 0.0, accuracy: float = 0.0):
    """
    Guarda el ping GPS, verifica desvio y crea incidencia si corresponde.
    Retorna (TrackingLog, deviation_info_dict).
    """
    from .models import TrackingLog, Incident

    deviation_meters = 0.0
    is_deviated      = False

    if service.route:
        deviation_meters = calculate_deviation(service.route.geometry, lat, lng)
        is_deviated      = deviation_meters > service.route.tolerance_meters

    log = TrackingLog.objects.create(
        service=service,
        motorizado=motorizado,
        location=Point(lng, lat, srid=4326),
        speed_kmh=speed,
        heading=heading,
        accuracy_meters=accuracy,
        deviation_meters=deviation_meters,
        is_deviated=is_deviated,
    )

    if is_deviated:
        _maybe_create_incident(service, log, deviation_meters)

    return log, {
        'deviation_meters': deviation_meters,
        'is_deviated':      is_deviated,
        'tolerance_meters': service.route.tolerance_meters if service.route else 0,
    }


def _maybe_create_incident(service, tracking_log, deviation_meters):
    """
    Crea una incidencia de desvio solo si la ultima fue hace mas de 60 segundos.
    Evita spam de incidencias por GPS inestable.
    """
    from .models import Incident

    last = Incident.objects.filter(
        service=service,
        type=Incident.Type.DEVIATION,
        resolved=False,
    ).order_by('-created_at').first()

    cooldown = timedelta(seconds=60)
    if last and (timezone.now() - last.created_at) < cooldown:
        return  # Aun en cooldown, no crear otra

    Incident.objects.create(
        service=service,
        tracking_log=tracking_log,
        type=Incident.Type.DEVIATION,
        description=(
            f'Motorizado a {deviation_meters:.0f}m de la ruta '
            f'(tolerancia: {service.route.tolerance_meters:.0f}m).'
        ),
    )
    # Notificar al admin (stub — implementar con FCM/email en produccion)
    print(f'[ALERTA] Desvio detectado — Servicio {service.id} — {deviation_meters:.0f}m')
