"""
Integración con OSRM para generación de rutas sobre OpenStreetMap.
Motor: OSRM (Open Source Routing Machine).

Configuración en settings.py:
  OSRM_BASE_URL = 'https://router.project-osrm.org'  (demo público)
  OSRM_BASE_URL = 'http://localhost:5000'             (instancia local)
  OSRM_TIMEOUT  = 10  (segundos)
"""
import logging
import requests
from django.conf import settings
from tracking.polyline_utils import decode_polyline, encode_polyline

logger = logging.getLogger(__name__)

OSRM_BASE_URL = getattr(settings, 'OSRM_BASE_URL', 'https://router.project-osrm.org')
OSRM_TIMEOUT  = getattr(settings, 'OSRM_TIMEOUT', 10)


def get_osrm_route(waypoints: list) -> dict:
    """
    Genera una ruta entre los waypoints usando OSRM.

    waypoints: lista de (lat, lng) ordenada por recorrido.

    Retorna:
      {
        'encoded_polyline': str,     # Google Encoded Polyline precision 5
        'steps':            list,    # Pasos de navegación (instrucciones)
        'coords':           list,    # [[lat, lng], ...] decodificados
        'distance_m':       float,   # Distancia total en metros
        'duration_s':       float,   # Duración estimada en segundos
      }
    """
    if len(waypoints) < 2:
        raise ValueError('Se requieren al menos 2 waypoints para calcular una ruta.')

    # Formato OSRM: lng,lat;lng,lat;...
    coords_str = ';'.join(f'{lng},{lat}' for lat, lng in waypoints)
    url = (
        f'{OSRM_BASE_URL}/route/v1/driving/{coords_str}'
        f'?overview=full&geometries=polyline&steps=true&annotations=false'
    )

    try:
        resp = requests.get(url, timeout=OSRM_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        if data.get('code') != 'Ok' or not data.get('routes'):
            logger.warning('[OSRM] Sin ruta: code=%s', data.get('code'))
            return _fallback_route(waypoints)

        route      = data['routes'][0]
        geometry   = route.get('geometry', '')   # polyline precision 5 de OSRM
        distance_m = route.get('distance', 0.0)
        duration_s = route.get('duration', 0.0)

        steps = _extract_steps(route)
        coords = decode_polyline(geometry)

        return {
            'encoded_polyline': geometry,
            'steps':            steps,
            'coords':           coords,
            'distance_m':       distance_m,
            'duration_s':       duration_s,
        }

    except requests.Timeout:
        logger.error('[OSRM] Timeout después de %ds', OSRM_TIMEOUT)
        return _fallback_route(waypoints)
    except requests.RequestException as exc:
        logger.error('[OSRM] Error de red: %s', exc)
        return _fallback_route(waypoints)
    except Exception as exc:
        logger.error('[OSRM] Error inesperado: %s', exc)
        return _fallback_route(waypoints)


def _extract_steps(route: dict) -> list:
    """Extrae y simplifica los pasos de navegación de la respuesta OSRM."""
    steps = []
    for leg in route.get('legs', []):
        for step in leg.get('steps', []):
            maneuver = step.get('maneuver', {})
            steps.append({
                'distance':    round(step.get('distance', 0), 1),
                'duration':    round(step.get('duration', 0), 1),
                'instruction': _build_instruction(step),
                'name':        step.get('name', ''),
                'mode':        step.get('mode', 'driving'),
                'maneuver':    maneuver.get('type', ''),
                'modifier':    maneuver.get('modifier', ''),
            })
    return steps


_TYPE_ES = {
    'depart':            'Partir',
    'arrive':            'Llegar al destino',
    'turn':              'Girar',
    'new name':          'Continuar',
    'merge':             'Incorporarse',
    'fork':              'Mantener',
    'roundabout':        'Tomar la rotonda',
    'exit roundabout':   'Salir de la rotonda',
    'rotary':            'Tomar la rotonda',
    'exit rotary':       'Salir de la rotonda',
    'on ramp':           'Tomar el ramal',
    'off ramp':          'Salir por el ramal',
    'end of road':       'Al final del camino',
    'use lane':          'Usar el carril',
    'continue':          'Continuar',
    'notification':      '',
}

_MOD_ES = {
    'left':         'a la izquierda',
    'right':        'a la derecha',
    'slight left':  'ligeramente a la izquierda',
    'slight right': 'ligeramente a la derecha',
    'sharp left':   'bruscamente a la izquierda',
    'sharp right':  'bruscamente a la derecha',
    'straight':     'recto',
    'uturn':        'en U',
}


def _build_instruction(step: dict) -> str:
    maneuver = step.get('maneuver', {})
    m_type   = maneuver.get('type', '')
    modifier = maneuver.get('modifier', '')
    name     = step.get('name', '')

    action = _TYPE_ES.get(m_type, m_type.replace('_', ' ').capitalize())
    mod    = _MOD_ES.get(modifier, '')

    parts = [p for p in [action, mod] if p]
    if name:
        parts.append(f'en {name}')
    return ' '.join(parts).strip() or 'Continuar'


def _fallback_route(waypoints: list) -> dict:
    """
    Fallback cuando OSRM no responde: línea recta entre waypoints.
    Produce una polyline mínima válida para que el sistema funcione.
    """
    logger.info('[OSRM] Usando fallback línea recta (%d waypoints)', len(waypoints))
    coords   = [[lat, lng] for lat, lng in waypoints]
    encoded  = encode_polyline(coords)

    total_m = 0.0
    from tracking.polyline_utils import haversine_m
    for i in range(len(waypoints) - 1):
        total_m += haversine_m(
            waypoints[i][0], waypoints[i][1],
            waypoints[i + 1][0], waypoints[i + 1][1],
        )

    return {
        'encoded_polyline': encoded,
        'steps':            [],
        'coords':           coords,
        'distance_m':       round(total_m, 1),
        'duration_s':       0.0,
    }
