from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0003_document_recipient_address_document_recipient_name_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Vehicle',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('plate', models.CharField(help_text='Placa del vehículo', max_length=20, unique=True)),
                ('brand', models.CharField(max_length=50)),
                ('model', models.CharField(max_length=50)),
                ('year', models.PositiveSmallIntegerField()),
                ('status', models.CharField(
                    choices=[('active', 'Activo'), ('maintenance', 'En mantenimiento'), ('inactive', 'Inactivo')],
                    db_index=True, default='active', max_length=20,
                )),
                ('assigned_motorizado', models.ForeignKey(
                    blank=True, limit_choices_to={'role': 'motorizado'},
                    null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='assigned_vehicle', to=settings.AUTH_USER_MODEL,
                )),
                ('mileage', models.PositiveIntegerField(default=0, help_text='Kilómetros recorridos')),
                ('fuel_consumption_rate', models.FloatField(default=50.0, help_text='Rendimiento en km/l')),
                ('last_maintenance', models.DateField(blank=True, null=True)),
                ('next_maintenance', models.DateField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, help_text='Problemas o notas adicionales')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Vehículo',
                'verbose_name_plural': 'Vehículos',
                'db_table': 'vehicles',
                'ordering': ['plate'],
            },
        ),
    ]
