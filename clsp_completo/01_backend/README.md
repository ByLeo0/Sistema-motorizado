# CLSP S.A.C. — Backend de Logística

API REST construida con Django + DRF + PostGIS para gestión de servicios de transporte,
rastreo GPS de motorizados y detección automática de desvíos de ruta.

---

## Requisitos previos (Windows)

1. **Python 3.11+** — https://www.python.org/downloads/
2. **PostgreSQL 15 + PostGIS** — https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
   - Durante la instalación marcar: PostgreSQL Server, pgAdmin 4, Stack Builder
   - Con Stack Builder instalar: *Spatial Extensions → PostGIS Bundle for PostgreSQL 15*
3. **GDAL para Windows** — descargar el wheel desde:
   https://github.com/cgohlke/geospatial-wheels/releases
   Buscar el archivo: `GDAL-3.8.x-cp311-cp311-win_amd64.whl` (ajustar según tu Python)

---

## Instalación paso a paso

```powershell
# 1. Clonar / descomprimir el proyecto y abrir en VS Code

# 2. Crear entorno virtual
python -m venv venv
venv\Scripts\activate

# 3. Instalar GDAL (ajustar nombre del archivo descargado)
pip install GDAL-3.8.4-cp311-cp311-win_amd64.whl

# 4. Instalar dependencias
pip install -r requirements.txt

# 5. Copiar y configurar variables de entorno
copy .env.example .env
# Editar .env con tu contraseña de PostgreSQL y la ruta exacta de gdal.dll

# 6. Crear base de datos en pgAdmin (Query Tool):
#    CREATE USER clsp_user WITH PASSWORD 'clsp_pass';
#    CREATE DATABASE clsp_db OWNER clsp_user;
#    \c clsp_db
#    CREATE EXTENSION postgis;

# 7. Aplicar migraciones
python manage.py migrate

# 8. Crear usuario administrador
python manage.py createsuperuser

# 9. Arrancar el servidor
python manage.py runserver
```

---

## URLs principales

| URL | Descripción |
|-----|-------------|
| http://localhost:8000/api/docs/ | Swagger UI — documentación interactiva |
| http://localhost:8000/api/auth/login/ | Login → obtener JWT |
| http://localhost:8000/api/services/ | CRUD de servicios |
| http://localhost:8000/api/users/ | CRUD de usuarios (admin) |
| http://localhost:8000/api/incidents/ | Incidencias de desvío |
| http://localhost:8000/api/tracking/ping/ | Ping GPS del motorizado |
| http://localhost:8000/admin/ | Panel de administración Django |

---

## Flujo de estados de un servicio

```
pending → approved → in_transit → completed
        ↓
      rejected
        
pending/approved → cancelled
```

---

## Ejecutar tests

```powershell
python manage.py test services.tests --verbosity=2
```

---

## Estructura del proyecto

```
clsp_backend/
├── core/               Configuración principal (settings, urls, wsgi)
├── accounts/           Usuarios, autenticación JWT, permisos por rol
├── services/           Servicios de transporte, rutas, documentos
├── tracking/           Logs GPS, geofencing lineal, incidencias
├── .env.example        Variables de entorno de ejemplo
├── manage.py
└── requirements.txt
```

---

## Semana 2 (próximos pasos)

- WebSockets con Django Channels para tracking en tiempo real
- App móvil React Native con geolocalización en background
- Panel de administrador React con mapa Mapbox en tiempo real

