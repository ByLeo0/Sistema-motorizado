"""
Lógica de geofencing lineal con map-matching sobre polyline codificada.

Flujo por ping GPS:
  1. Snap del punto al segmento más cercano de la polyline (map_match).
  2. Distancia perpendicular al eje (metros) — no distancia euclidiana al bbox.
  3. Histéresis: se considera DESVIADO solo si d > tolerancia durante ≥3 muestras
     consecutivas (evita falsos positivos por ruido GPS).
  4. Incidencia automática creada solo tras confirmar histéresis y respetar cooldown.

Fallback: si la ruta no tiene encoded_polyline, se usa ST_Distance PostGIS.
"""
from django.contrib.gis.geos import Point
from django.db import connection
from django.utils import timezone
from datetime import timedelta

HYSTERESIS_COUNT = 3   # muestras consecutivas desviadas para confirmar desvío


# ─── Cálculo de snap ─────────────────────────────────────────────────────────

def _snap_via_polyline(encoded_polyline: str, lat: float, lng: float) -> dict:
    """Map-match usando polyline codificada. Retorna dict con snapped_* y distance_m."""
    from .polyline_utils import decode_polyline, map_match
    decoded = decode_polyline(encoded_polyline)
    return map_match(decoded, lat, lng)


def _snap_via_postgis(route_geometry, lat: float, lng: float) -> dict:
    """Fallback: distancia mínima al LineString vía ST_Distance PostGIS."""
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT ST_Distance(
                ST_Transform(ST_SetSRID(ST_MakePoint(%s, %s), 4326), 3857),
                ST_Transform(ST_SetSRID(%s::geometry, 4326), 3857)
            )
        """, [lng, lat, route_geometry.wkt])
        row = cursor.fetchone()
    dist = round(row[0], 2) if row else 0.0
    return {
        'snapped_lat': lat,
        'snapped_lng': lng,
        'distance_m':  dist,
        'segment_idx': 0,
        'reentry_lat': lat,
        'reentry_lng': lng,
    }


def snap_to_route(route, lat: float, lng: float) -> dict:
    """
    Devuelve información de snap para el punto (lat, lng) sobre la ruta.
    Usa map-matching si hay encoded_polyline; de lo contrario PostGIS.
    """
    if route.encoded_polyline:
        return _snap_via_polyline(route.encoded_polyline, lat, lng)
    return _snap_via_postgis(route.geometry, lat, lng)


# ─── Histéresis ───────────────────────────────────────────────────────────────

def _count_consecutive_deviations(service) -> int:
    """
    Cuenta cuántos logs consecutivos más recientes (ordenados por tiempo desc)
    tienen is_deviated=True. Incluye el log más reciente como primero.
    """
    from .models import TrackingLog
    recent = list(
        TrackingLog.objects
        .filter(service=service)
        .order_by('-timestamp')
        .values_list('is_deviated', flat=True)[:HYSTERESIS_COUNT]
    )
    count = 0
    for deviated in recent:
        if deviated:
            count += 1
        else:
            break
    return count


# ─── Punto de entrada principal ───────────────────────────────────────────────

def save_tracking_ping(service, motorizado, lat: float, lng: float,
                       speed: float = 0.0, heading: float = 0.0, accuracy: float = 0.0):
    """
    Guarda el ping GPS con snap + histéresis y crea incidencia si corresponde.

    Retorna (TrackingLog, deviation_info_dict).

    deviation_info contiene:
      deviation_meters  float  – distancia perpendicular al eje de la ruta
      is_deviated       bool   – True solo si histéresis ≥ HYSTERESIS_COUNT
      tolerance_meters  float
      route_status      str    – 'EN_RUTA' | 'DESVIADO'
      snapped_lat       float
      snapped_lng       float
      reentry_lat       float  – punto de reingreso más cercano sobre la polyline
      reentry_lng       float
    """
    from .models import TrackingLog, Incident

    deviation_meters = 0.0
    is_deviated_raw  = False   # desvío instantáneo (sin histéresis)
    is_deviated      = False   # desvío confirmado (con histéresis)
    snapped_lat      = lat
    snapped_lng      = lng
    reentry_lat      = lat
    reentry_lng      = lng

    if service.route:
        snap = snap_to_route(service.route, lat, lng)
        deviation_meters = snap['distance_m']
        snapped_lat      = snap['snapped_lat']
        snapped_lng      = snap['snapped_lng']
        reentry_lat      = snap['reentry_lat']
        reentry_lng      = snap['reentry_lng']
        is_deviated_raw  = deviation_meters > service.route.tolerance_meters

    # Guardamos el log con is_deviated_raw (valor instantáneo real)
    log = TrackingLog.objects.create(
        service=service,
        motorizado=motorizado,
        location=Point(lng, lat, srid=4326),
        speed_kmh=speed,
        heading=heading,
        accuracy_meters=accuracy,
        deviation_meters=deviation_meters,
        is_deviated=is_deviated_raw,
    )

    # Evaluar histéresis sobre los últimos HYSTERESIS_COUNT logs (incluye el actual)
    if is_deviated_raw:
        consecutive = _count_consecutive_deviations(service)
        is_deviated = consecutive >= HYSTERESIS_COUNT
    else:
        is_deviated = False

    if is_deviated:
        _maybe_create_incident(service, log, deviation_meters)

    tolerance = service.route.tolerance_meters if service.route else 0.0
    return log, {
        'deviation_meters': deviation_meters,
        'is_deviated':      is_deviated,
        'tolerance_meters': tolerance,
        'route_status':     'DESVIADO' if is_deviated else 'EN_RUTA',
        'snapped_lat':      snapped_lat,
        'snapped_lng':      snapped_lng,
        'reentry_lat':      reentry_lat,
        'reentry_lng':      reentry_lng,
    }


# ─── Incidencias automáticas ──────────────────────────────────────────────────

def _maybe_create_incident(service, tracking_log, deviation_meters: float):
    """
    Crea incidencia de desvío solo si la última fue hace más de 60 s (cooldown).
    """
    from .models import Incident

    last = Incident.objects.filter(
        service=service,
        type=Incident.Type.DEVIATION,
        resolved=False,
    ).order_by('-created_at').first()

    if last and (timezone.now() - last.created_at) < timedelta(seconds=60):
        return

    Incident.objects.create(
        service=service,
        tracking_log=tracking_log,
        type=Incident.Type.DEVIATION,
        description=(
            f'Motorizado a {deviation_meters:.0f}m de la ruta '
            f'(tolerancia: {service.route.tolerance_meters:.0f}m). '
            f'Desvío confirmado tras {HYSTERESIS_COUNT} muestras consecutivas.'
        ),
    )
    print(f'[ALERTA] Desvío — Servicio {service.id} — {deviation_meters:.0f}m')


# ─── Utilidad legacy (mantiene compatibilidad con código anterior) ─────────────

def calculate_deviation(route_geometry, lat: float, lng: float) -> float:
    """Calcula distancia mínima (metros) vía PostGIS ST_Distance."""
    result = _snap_via_postgis(route_geometry, lat, lng)
    return result['distance_m']
