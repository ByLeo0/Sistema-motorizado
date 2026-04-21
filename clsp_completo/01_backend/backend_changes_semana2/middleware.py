# tracking/middleware.py — ARCHIVO NUEVO
"""
Middleware de autenticacion JWT para WebSockets.
Django Channels no usa el sistema de autenticacion HTTP normal,
por eso necesitamos leer el token manualmente del query string.

Uso desde la app movil:
  ws://localhost:8000/ws/tracking/{id}/?token=eyJ...
"""
from urllib.parse import parse_qs
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError


@database_sync_to_async
def get_user_from_token(token_str):
    """Valida el JWT y retorna el usuario. Si falla, retorna AnonymousUser."""
    try:
        from accounts.models import User
        token   = AccessToken(token_str)
        user_id = token['user_id']
        return User.objects.get(id=user_id, is_active=True)
    except (TokenError, KeyError, Exception):
        return AnonymousUser()


class JWTAuthMiddleware:
    """
    Middleware que inyecta request.user en el scope del WebSocket
    leyendo el token del query string: ?token=eyJ...
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        query_string = scope.get('query_string', b'').decode()
        params       = parse_qs(query_string)
        token_list   = params.get('token', [])

        if token_list:
            scope['user'] = await get_user_from_token(token_list[0])
        else:
            scope['user'] = AnonymousUser()

        return await self.app(scope, receive, send)
