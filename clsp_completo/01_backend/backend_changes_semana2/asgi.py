# core/asgi.py — REEMPLAZAR el archivo original completo
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.local')
django.setup()

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application
from tracking.middleware import JWTAuthMiddleware
from tracking import routing as tracking_routing

application = ProtocolTypeRouter({
    # Peticiones HTTP normales
    'http': get_asgi_application(),

    # WebSockets con autenticacion JWT en el middleware
    'websocket': AllowedHostsOriginValidator(
        JWTAuthMiddleware(
            URLRouter(tracking_routing.websocket_urlpatterns)
        )
    ),
})
