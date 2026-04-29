from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0004_vehicle'),
    ]

    operations = [
        migrations.AddField(
            model_name='service',
            name='customer_name',
            field=models.CharField(blank=True, help_text='Nombre del destinatario', max_length=200),
        ),
        migrations.AddField(
            model_name='service',
            name='customer_phone',
            field=models.CharField(blank=True, help_text='Teléfono del destinatario', max_length=20),
        ),
        migrations.AddField(
            model_name='service',
            name='customer_address',
            field=models.CharField(blank=True, help_text='Dirección del destinatario', max_length=255),
        ),
        migrations.AddField(
            model_name='service',
            name='stops',
            field=models.JSONField(blank=True, help_text='Paradas intermedias [{lat, lng, description}]', null=True),
        ),
        migrations.AddField(
            model_name='service',
            name='rating',
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text='Puntuación del servicio (0-5)',
                null=True,
                validators=[
                    django.core.validators.MinValueValidator(0),
                    django.core.validators.MaxValueValidator(5),
                ],
            ),
        ),
    ]
