"""
Tests del flujo completo: crear -> aprobar -> iniciar -> completar.
Ejecutar con: python manage.py test services.tests --verbosity=2
"""
from django.test import TestCase
from django.contrib.gis.geos import Point
from rest_framework.test import APIClient
from rest_framework import status
from accounts.models import User
from services.models import Service, Route

ROUTE_GEOJSON = {
    "type": "LineString",
    "coordinates": [
        [-77.0428, -12.0464],
        [-77.0350, -12.0400],
        [-77.0280, -12.0350],
    ]
}


def crear_usuario(email, role, password='Passw0rd!'):
    user = User.objects.create_user(
        email=email, username=email, password=password,
        role=role, first_name=role.capitalize(), last_name='Test',
    )
    return user


class AuthTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.admin = crear_usuario('admin@clsp.pe', 'admin')

    def test_login_exitoso(self):
        resp = self.client.post('/api/auth/login/', {'email': 'admin@clsp.pe', 'password': 'Passw0rd!'})
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access',  resp.data)
        self.assertIn('refresh', resp.data)
        self.assertEqual(resp.data['user']['role'], 'admin')

    def test_login_credenciales_incorrectas(self):
        resp = self.client.post('/api/auth/login/', {'email': 'admin@clsp.pe', 'password': 'mal'})
        self.assertEqual(resp.status_code, 401)

    def test_acceso_sin_token(self):
        resp = self.client.get('/api/services/')
        self.assertEqual(resp.status_code, 401)


class ServiceFlowTests(TestCase):

    def setUp(self):
        self.client     = APIClient()
        self.admin      = crear_usuario('admin@clsp.pe',      'admin')
        self.motorizado = crear_usuario('moto@clsp.pe',       'motorizado')
        self.cliente    = crear_usuario('cliente@clsp.pe',    'cliente')

    def _auth(self, email, password='Passw0rd!'):
        resp = self.client.post('/api/auth/login/', {'email': email, 'password': password})
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {resp.data["access"]}')

    def _crear_servicio(self):
        self._auth('cliente@clsp.pe')
        return self.client.post('/api/services/', {
            'origin_lat':      -12.0464,
            'origin_lng':      -77.0428,
            'destination_lat': -12.0350,
            'destination_lng': -77.0280,
            'notes':           'Entrega urgente Lima Centro',
        })

    # ── Test 1: Flujo completo happy path ─────────────────────────────────
    def test_flujo_completo(self):
        # Crear
        resp = self._crear_servicio()
        self.assertEqual(resp.status_code, 201)
        sid = resp.data['id']
        self.assertEqual(resp.data['status'], 'pending')

        # Aprobar
        self._auth('admin@clsp.pe')
        resp = self.client.post(f'/api/services/{sid}/approve/', {
            'motorizado_id':   str(self.motorizado.id),
            'route_geometry':  ROUTE_GEOJSON,
            'tolerance_meters': 150,
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'approved')

        # Iniciar
        self._auth('moto@clsp.pe')
        resp = self.client.post(f'/api/services/{sid}/start/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'in_transit')
        self.assertIn('route', resp.data)

        # Completar
        resp = self.client.post(f'/api/services/{sid}/complete/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'completed')

    # ── Test 2: Cliente no puede aprobar ──────────────────────────────────
    def test_cliente_no_puede_aprobar(self):
        resp = self._crear_servicio()
        sid  = resp.data['id']
        # Sigue autenticado como cliente
        resp = self.client.post(f'/api/services/{sid}/approve/', {
            'motorizado_id':  str(self.motorizado.id),
            'route_geometry': ROUTE_GEOJSON,
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    # ── Test 3: No se puede iniciar sin aprobar ───────────────────────────
    def test_no_puede_iniciar_sin_aprobar(self):
        resp = self._crear_servicio()
        sid  = resp.data['id']
        self._auth('moto@clsp.pe')
        resp = self.client.post(f'/api/services/{sid}/start/')
        self.assertEqual(resp.status_code, 400)

    # ── Test 4: Motorizado solo ve sus servicios ──────────────────────────
    def test_motorizado_solo_ve_sus_servicios(self):
        self._crear_servicio()
        self._auth('moto@clsp.pe')
        resp = self.client.get('/api/services/')
        self.assertEqual(resp.data['count'], 0)  # Aun no asignado

    # ── Test 5: Admin ve todos los servicios ─────────────────────────────
    def test_admin_ve_todos(self):
        self._crear_servicio()
        self._auth('admin@clsp.pe')
        resp = self.client.get('/api/services/')
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(resp.data['count'], 1)

    # ── Test 6: Rechazo con motivo ────────────────────────────────────────
    def test_rechazar_servicio(self):
        resp = self._crear_servicio()
        sid  = resp.data['id']
        self._auth('admin@clsp.pe')
        resp = self.client.post(f'/api/services/{sid}/reject/', {'reason': 'Zona no cubierta'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'rejected')

    # ── Test 7: Dashboard del admin ───────────────────────────────────────
    def test_dashboard(self):
        self._crear_servicio()
        self._auth('admin@clsp.pe')
        resp = self.client.get('/api/services/dashboard/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('pending',  resp.data)
        self.assertIn('total',    resp.data)
        self.assertGreaterEqual(resp.data['pending'], 1)
