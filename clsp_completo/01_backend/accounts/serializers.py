from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User


class UserSerializer(serializers.ModelSerializer):
    full_name  = serializers.ReadOnlyField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            'id', 'email', 'full_name', 'first_name', 'last_name',
            'role', 'phone', 'address', 'avatar_url', 'is_active', 'date_joined',
        ]
        read_only_fields = ['id', 'date_joined', 'avatar_url']

    def get_avatar_url(self, obj):
        request = self.context.get('request')
        if obj.avatar and request:
            return request.build_absolute_uri(obj.avatar.url)
        return None


class UserCreateSerializer(serializers.ModelSerializer):
    password  = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True, label='Confirmar contrasena')

    class Meta:
        model  = User
        fields = ['email', 'password', 'password2', 'first_name', 'last_name', 'phone', 'role']

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({'password2': 'Las contrasenas no coinciden.'})
        return attrs

    def validate_role(self, value):
        request = self.context.get('request')
        if value in ('admin', 'motorizado'):
            if not request or not request.user.is_authenticated or request.user.role != 'admin':
                raise serializers.ValidationError(
                    'No tienes permiso para asignar el rol admin o motorizado.'
                )
        return value

    def create(self, validated_data):
        password = validated_data.pop('password')
        validated_data.setdefault('username', validated_data['email'])
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = User
        fields = ['first_name', 'last_name', 'phone', 'address', 'fcm_token', 'role']
        extra_kwargs = {'role': {'required': False}}


class CLSPTokenSerializer(TokenObtainPairSerializer):
    """JWT con datos del usuario embebidos en el payload."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role']      = user.role
        token['full_name'] = user.full_name
        token['email']     = user.email
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user, context=self.context).data
        return data
