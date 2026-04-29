from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from accounts.views import CLSPLoginView, UserViewSet, LogoutView
from services.views import ServiceViewSet, VehicleViewSet, AuditLogView
from tracking.views import IncidentViewSet, TrackingPingView, ActiveMotorizadosView, StatsView, SnapView

router = DefaultRouter()
router.register(r'users',     UserViewSet,     basename='user')
router.register(r'services',  ServiceViewSet,  basename='service')
router.register(r'incidents', IncidentViewSet, basename='incident')
router.register(r'vehicles',  VehicleViewSet,  basename='vehicle')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),

    # Auth
    path('api/auth/login/',   CLSPLoginView.as_view(),    name='login'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/logout/',  LogoutView.as_view(),       name='logout'),

    # Tracking GPS
    path('api/tracking/ping/',   TrackingPingView.as_view(),        name='tracking_ping'),
    path('api/tracking/snap/',   SnapView.as_view(),                name='tracking_snap'),
    path('api/tracking/active/', ActiveMotorizadosView.as_view(),   name='tracking_active'),
    path('api/tracking/stats/',  StatsView.as_view(),               name='tracking_stats'),

    # Auditoría
    path('api/audit/', AuditLogView.as_view(), name='audit_log'),

    # Swagger / OpenAPI
    path('api/schema/', SpectacularAPIView.as_view(),                         name='schema'),
    path('api/docs/',   SpectacularSwaggerView.as_view(url_name='schema'),    name='swagger'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
