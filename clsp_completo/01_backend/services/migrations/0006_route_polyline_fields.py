from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0005_service_customer_stops_rating'),
    ]

    operations = [
        migrations.AddField(
            model_name='route',
            name='encoded_polyline',
            field=models.TextField(
                blank=True,
                help_text='Google Encoded Polyline (precision 5) generada por OSRM',
            ),
        ),
        migrations.AddField(
            model_name='route',
            name='polyline_steps',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Pasos de navegación generados por OSRM/GraphHopper',
            ),
        ),
    ]
