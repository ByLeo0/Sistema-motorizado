# tracking/routing.py — ARCHIVO NUEVO
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # ws://localhost:8000/ws/tracking/{service_id}/
    # El motorizado y el admin se conectan al mismo canal del servicio.
    # El motorizado envia pings; el admin los recibe en tiempo real en el mapa.
    re_path(
        r'ws/tracking/(?P<service_id>[0-9a-f-]{36})/$',
        consumers.TrackingConsumer.as_asgi(),
    ),
]
