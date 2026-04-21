# ============================================================
# AGREGAR ESTO AL FINAL DE core/settings/base.py
# ============================================================

# ── Django Channels ─────────────────────────────────────────
INSTALLED_APPS += ['channels', 'daphne']

# Daphne reemplaza al servidor WSGI de Django para soportar WebSockets
ASGI_APPLICATION = 'core.asgi.application'

# Redis como channel layer (broker de mensajes entre procesos)
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [(
                config('REDIS_HOST', default='127.0.0.1'),
                config('REDIS_PORT', cast=int, default=6379),
            )],
            'capacity':  1500,
            'expiry':    10,
        },
    },
}

# ── Variables nuevas en .env ─────────────────────────────────
# REDIS_HOST=127.0.0.1
# REDIS_PORT=6379
