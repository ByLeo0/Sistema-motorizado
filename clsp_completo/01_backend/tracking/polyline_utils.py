"""
Utilidades para Google Encoded Polyline Algorithm (precisión 5 por defecto).
Incluye: codificación/decodificación, Haversine, proyección punto→segmento y map-matching.
"""
import math


# ─── Encode / Decode ──────────────────────────────────────────────────────────

def decode_polyline(encoded: str, precision: int = 5) -> list:
    """
    Decodifica una polyline codificada → lista de [lat, lng].
    Compatible con OSRM (precision=5) y GraphHopper (precision=5 o 6).
    """
    coords  = []
    index   = 0
    lat     = 0
    lng     = 0
    factor  = 10 ** precision

    while index < len(encoded):
        # latitud
        result, shift = 0, 0
        while True:
            b      = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift  += 5
            if b < 0x20:
                break
        lat += (~result >> 1) if (result & 1) else (result >> 1)

        # longitud
        result, shift = 0, 0
        while True:
            b      = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift  += 5
            if b < 0x20:
                break
        lng += (~result >> 1) if (result & 1) else (result >> 1)

        coords.append([lat / factor, lng / factor])

    return coords


def encode_polyline(coords: list, precision: int = 5) -> str:
    """
    Codifica lista de [lat, lng] → Google Encoded Polyline string.
    """
    factor   = 10 ** precision
    output   = []
    prev_lat = 0
    prev_lng = 0

    for coord in coords:
        lat, lng = coord[0], coord[1]
        ilat = round(lat * factor)
        ilng = round(lng * factor)
        for val in (ilat - prev_lat, ilng - prev_lng):
            val = val << 1
            if val < 0:
                val = ~val
            while val >= 0x20:
                output.append(chr((0x20 | (val & 0x1F)) + 63))
                val >>= 5
            output.append(chr(val + 63))
        prev_lat = ilat
        prev_lng = ilng

    return ''.join(output)


def segment_polyline(decoded_coords: list) -> list:
    """
    Devuelve lista de segmentos [(a_lat, a_lng, b_lat, b_lng), ...].
    """
    return [
        (decoded_coords[i][0], decoded_coords[i][1],
         decoded_coords[i + 1][0], decoded_coords[i + 1][1])
        for i in range(len(decoded_coords) - 1)
    ]


# ─── Geometría ────────────────────────────────────────────────────────────────

def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distancia Haversine en metros."""
    R    = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a    = (math.sin(dphi / 2) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _to_xy(lat: float, lng: float, ref_lat: float, ref_lng: float) -> tuple:
    """Proyección plana local en metros relativa a ref_lat/ref_lng."""
    cos_lat = math.cos(math.radians(ref_lat))
    x = (lng - ref_lng) * 111_320.0 * cos_lat
    y = (lat - ref_lat) * 110_574.0
    return x, y


def _from_xy(x: float, y: float, ref_lat: float, ref_lng: float) -> tuple:
    cos_lat = math.cos(math.radians(ref_lat))
    lat = ref_lat + y / 110_574.0
    lng = ref_lng + x / (111_320.0 * cos_lat)
    return lat, lng


def project_point_to_segment(
    px: float, py: float,
    ax: float, ay: float,
    bx: float, by: float,
) -> tuple:
    """
    Proyecta el punto P=(px,py) sobre el segmento A→B (coordenadas planas, metros).
    Retorna (snapped_x, snapped_y, t, dist_m):
      t     = parámetro en [0, 1]  (0=A, 1=B)
      dist_m = distancia perpendicular al eje del segmento
    """
    dx, dy   = bx - ax, by - ay
    seg_len2 = dx * dx + dy * dy
    if seg_len2 < 1e-12:
        return ax, ay, 0.0, math.hypot(px - ax, py - ay)
    t  = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len2))
    sx = ax + t * dx
    sy = ay + t * dy
    return sx, sy, t, math.hypot(px - sx, py - sy)


def map_match(decoded_coords: list, lat: float, lng: float) -> dict:
    """
    Encuentra el punto más cercano (snap) sobre la polyline decodificada.

    Retorna:
      {
        snapped_lat  float   – coordenada snapped sobre el eje
        snapped_lng  float
        distance_m   float   – distancia perpendicular al eje (metros)
        segment_idx  int     – índice del segmento más cercano (0-based)
        reentry_lat  float   – punto de reingreso más cercano (= snapped)
        reentry_lng  float
      }
    """
    if not decoded_coords or len(decoded_coords) < 2:
        return {
            'snapped_lat': lat, 'snapped_lng': lng,
            'distance_m': 0.0, 'segment_idx': 0,
            'reentry_lat': lat, 'reentry_lng': lng,
        }

    ref_lat, ref_lng = decoded_coords[0]
    px, py = _to_xy(lat, lng, ref_lat, ref_lng)

    best_dist = float('inf')
    best_sx   = 0.0
    best_sy   = 0.0
    best_idx  = 0

    for i in range(len(decoded_coords) - 1):
        a_lat, a_lng = decoded_coords[i]
        b_lat, b_lng = decoded_coords[i + 1]
        ax, ay = _to_xy(a_lat, a_lng, ref_lat, ref_lng)
        bx, by = _to_xy(b_lat, b_lng, ref_lat, ref_lng)
        sx, sy, _, dist = project_point_to_segment(px, py, ax, ay, bx, by)
        if dist < best_dist:
            best_dist = dist
            best_sx   = sx
            best_sy   = sy
            best_idx  = i

    snapped_lat, snapped_lng = _from_xy(best_sx, best_sy, ref_lat, ref_lng)

    return {
        'snapped_lat': round(snapped_lat, 7),
        'snapped_lng': round(snapped_lng, 7),
        'distance_m':  round(best_dist, 2),
        'segment_idx': best_idx,
        'reentry_lat': round(snapped_lat, 7),
        'reentry_lng': round(snapped_lng, 7),
    }
