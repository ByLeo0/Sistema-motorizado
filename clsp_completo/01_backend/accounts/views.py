from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import (
    UserSerializer, UserCreateSerializer, UserUpdateSerializer, CLSPTokenSerializer
)
from .permissions import IsAdmin


class CLSPLoginView(TokenObtainPairView):
    """
    POST /api/auth/login/
    Body: { "email": "...", "password": "..." }
    Respuesta: { "access": "...", "refresh": "...", "user": {...} }
    """
    serializer_class  = CLSPTokenSerializer
    permission_classes = [AllowAny]


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Body: { "refresh": "..." }
    Invalida el refresh token.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            token = RefreshToken(request.data['refresh'])
            token.blacklist()
            return Response({'detail': 'Sesion cerrada correctamente.'}, status=200)
        except Exception:
            return Response({'error': 'Token invalido o ya expirado.'}, status=400)


class UserViewSet(viewsets.ModelViewSet):
    """
    CRUD de usuarios.
    Solo el admin puede listar, crear, activar/desactivar.
    Cada usuario puede ver y editar su propio perfil via /api/users/me/
    """
    queryset = User.objects.all().order_by('first_name', 'last_name')
    filter_fields = ['role', 'is_active']
    search_fields = ['email', 'first_name', 'last_name']

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        if self.action in ('update', 'partial_update', 'me'):
            return UserUpdateSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action in ('me', 'update_fcm_token'):
            return [IsAuthenticated()]
        return [IsAdmin()]

    # GET/PATCH /api/users/me/
    @action(detail=False, methods=['get', 'patch'], permission_classes=[IsAuthenticated])
    def me(self, request):
        if request.method == 'PATCH':
            serializer = UserUpdateSerializer(request.user, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(UserSerializer(request.user).data)
        return Response(UserSerializer(request.user).data)

    # GET /api/users/motorizados/
    @action(detail=False, methods=['get'], permission_classes=[IsAdmin])
    def motorizados(self, request):
        """Lista de motorizados activos para asignar a servicios."""
        qs = User.objects.filter(role='motorizado', is_active=True).order_by('first_name')
        return Response(UserSerializer(qs, many=True).data)

    # PATCH /api/users/{id}/toggle_active/
    @action(detail=True, methods=['patch'], permission_classes=[IsAdmin])
    def toggle_active(self, request, pk=None):
        """Activa o desactiva un usuario."""
        user = self.get_object()
        user.is_active = not user.is_active
        user.save(update_fields=['is_active'])
        estado = 'activado' if user.is_active else 'desactivado'
        return Response({'detail': f'Usuario {estado}.', 'is_active': user.is_active})

    # PATCH /api/users/update_fcm_token/
    @action(detail=False, methods=['patch'], permission_classes=[IsAuthenticated])
    def update_fcm_token(self, request):
        """La app movil actualiza el token de push notifications."""
        token = request.data.get('fcm_token', '').strip()
        if not token:
            return Response({'error': 'fcm_token es requerido.'}, status=400)
        request.user.fcm_token = token
        request.user.save(update_fields=['fcm_token'])
        return Response({'detail': 'Token FCM actualizado.'})

    # POST /api/users/upload_avatar/
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def upload_avatar(self, request):
        """La app sube la foto de perfil del usuario."""
        file = request.FILES.get('avatar')
        if not file:
            return Response({'error': 'Archivo avatar requerido.'}, status=400)
        request.user.avatar = file
        request.user.save(update_fields=['avatar'])
        return Response(UserSerializer(request.user, context={'request': request}).data)
