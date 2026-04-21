from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdmin(BasePermission):
    """Solo administradores."""
    message = 'Solo los administradores pueden realizar esta accion.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role == 'admin')


class IsMotorizado(BasePermission):
    """Solo motorizados."""
    message = 'Solo los motorizados pueden realizar esta accion.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role == 'motorizado')


class IsCliente(BasePermission):
    """Solo clientes."""
    message = 'Solo los clientes pueden realizar esta accion.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role == 'cliente')


class IsAdminOrMotorizado(BasePermission):
    """Admin o motorizado."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role in ('admin', 'motorizado'))


class IsOwnerOrAdmin(BasePermission):
    """Admin puede todo; el dueno solo ve/edita sus propios objetos."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.role == 'admin':
            return True
        # Motorizado puede ver/operar servicios que tiene asignados
        if request.user.role == 'motorizado':
            return getattr(obj, 'assigned_motorizado', None) == request.user
        # Cliente solo ve sus propios objetos
        owner = getattr(obj, 'requester', None) or getattr(obj, 'user', None)
        return owner == request.user
