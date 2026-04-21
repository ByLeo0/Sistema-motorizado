import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN      = 'admin',      'Administrador'
        MOTORIZADO = 'motorizado', 'Motorizado'
        CLIENTE    = 'cliente',    'Cliente'

    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email     = models.EmailField(unique=True)
    role      = models.CharField(max_length=20, choices=Role.choices, default=Role.CLIENTE)
    phone     = models.CharField(max_length=20, blank=True)
    address   = models.CharField(max_length=255, blank=True, help_text='Direccion del usuario')
    fcm_token = models.CharField(max_length=255, blank=True,
                                  help_text='Token FCM para push notifications en la app movil')
    avatar    = models.ImageField(upload_to='avatars/', blank=True, null=True,
                                  help_text='Foto de perfil del usuario')

    USERNAME_FIELD  = 'email'
    REQUIRED_FIELDS = ['username', 'first_name', 'last_name']

    class Meta:
        db_table     = 'users'
        verbose_name = 'Usuario'
        verbose_name_plural = 'Usuarios'

    def __str__(self):
        return f'{self.full_name} ({self.role})'

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip() or self.email

    def is_admin(self):
        return self.role == self.Role.ADMIN

    def is_motorizado(self):
        return self.role == self.Role.MOTORIZADO

    def is_cliente(self):
        return self.role == self.Role.CLIENTE
