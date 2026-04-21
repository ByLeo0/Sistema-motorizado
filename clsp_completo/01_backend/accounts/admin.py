from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display  = ['email', 'full_name', 'role', 'phone', 'is_active', 'date_joined']
    list_filter   = ['role', 'is_active']
    search_fields = ['email', 'first_name', 'last_name']
    ordering      = ['first_name']

    fieldsets = UserAdmin.fieldsets + (
        ('CLSP', {'fields': ('role', 'phone', 'avatar', 'fcm_token')}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('CLSP', {'fields': ('role', 'phone')}),
    )
