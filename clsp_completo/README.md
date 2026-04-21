# CLSP S.A.C. — Sistema de Logística Completo

Este proyecto contiene tres carpetas independientes, cada una con su propio entorno:

```
clsp_completo/
├── 01_backend/    ← API Django + PostGIS + WebSockets (Python)
├── 02_mobile/     ← App React Native para motorizados (Node.js)
└── 03_admin/      ← Panel web para administradores (Node.js)
```

---

## REQUISITOS PREVIOS (instalar una sola vez)

| Herramienta | Descarga | Para qué |
|---|---|---|
| Python 3.11 | python.org/downloads | Backend |
| PostgreSQL 15 + PostGIS | enterprisedb.com/downloads | Base de datos geo |
| Redis (Windows port) | github.com/tporadowski/redis/releases | WebSockets |
| GDAL wheel | github.com/cgohlke/geospatial-wheels/releases | Geodata en Python |
| Node.js 18 LTS | nodejs.org | Admin + Mobile |
| Java JDK 17 | adoptium.net | App móvil |
| Android Studio | developer.android.com/studio | Emulador Android |
| Cuenta Mapbox (gratis) | account.mapbox.com | Mapas en el admin |

---

## CONFIGURACIÓN DE LA BASE DE DATOS

Abrir pgAdmin 4 → Query Tool y ejecutar:

```sql
CREATE USER clsp_user WITH PASSWORD 'clsp_pass';
CREATE DATABASE clsp_db OWNER clsp_user;
\c clsp_db
CREATE EXTENSION postgis;
```

---

## PASO 1 — Backend (01_backend)

```powershell
cd 01_backend

# Crear y activar entorno virtual
python -m venv venv
venv\Scripts\activate

# Instalar GDAL (ajusta el nombre al .whl que descargaste)
pip install GDAL-3.8.4-cp311-cp311-win_amd64.whl

# Instalar dependencias base (semana 1)
pip install -r requirements.txt

# Instalar dependencias de WebSocket (semana 2)
pip install channels==4.0.0 channels-redis==4.2.0 daphne==4.1.0 redis==5.0.3

# Configurar variables de entorno
copy .env.example .env
# Editar .env con: DB_PASSWORD, GDAL_LIBRARY_PATH

# Aplicar los archivos de WebSocket (semana 2)
copy backend_changes_semana2\asgi.py core\asgi.py
copy backend_changes_semana2\consumers.py tracking\consumers.py
copy backend_changes_semana2\middleware.py tracking\middleware.py
copy backend_changes_semana2\routing.py tracking\routing.py
# Agregar el contenido de backend_changes_semana2\settings_channels.py
# al final de core\settings\base.py

# Migraciones y arranque
python manage.py migrate
python manage.py createsuperuser
daphne -b 0.0.0.0 -p 8000 core.asgi:application
```

El backend queda corriendo en: http://localhost:8000
Swagger UI en: http://localhost:8000/api/docs/

---

## PASO 2 — Panel Admin (03_admin)

```powershell
cd 03_admin
npm install

# Crear archivo .env con el token de Mapbox
echo VITE_MAPBOX_TOKEN=pk.eyJ1... > .env

npm run dev
```

Panel disponible en: http://localhost:3000
Login con el superusuario creado en el paso 1.

---

## PASO 3 — App Móvil (02_mobile)

```powershell
cd 02_mobile
npm install

# Iniciar emulador Android desde Android Studio primero, luego:
npm run android
```

Editar `src/services/api.js` si usas dispositivo físico:
```js
// Emulador Android (por defecto):
export const BASE_URL = 'http://10.0.2.2:8000';

// Dispositivo físico (reemplaza con la IP de tu PC):
export const BASE_URL = 'http://192.168.1.XXX:8000';
```

---

## EJECUCIÓN DIARIA (una vez instalado todo)

Abrir 3 terminales:

```powershell
# Terminal 1 — Backend
cd 01_backend && venv\Scripts\activate && daphne -b 0.0.0.0 -p 8000 core.asgi:application

# Terminal 2 — Panel Admin
cd 03_admin && npm run dev

# Terminal 3 — App Móvil (con emulador ya abierto)
cd 02_mobile && npm run android
```

---

## FLUJO COMPLETO DEL SISTEMA

```
Cliente solicita servicio (POST /api/services/)
         ↓
Admin ve solicitud pendiente en el panel web
Admin dibuja la ruta en Mapbox y asigna motorizado
Admin aprueba (POST /api/services/{id}/approve/)
         ↓
Motorizado recibe notificación en la app
Motorizado pulsa "Iniciar recorrido"
GPS se activa en background
         ↓
WebSocket /ws/tracking/{id}/ ──► Admin ve posición en mapa en vivo
Backend calcula desvío (PostGIS)
Si desvío > tolerancia → Incidencia automática + alerta en el panel
         ↓
Motorizado escanea documento (guía de remisión / factura)
Motorizado pulsa "Completar entrega"
         ↓
Cliente recibe notificación de entrega completada
```
