from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("trips", "0003_trip_destination_provider_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="trip",
            name="timezone",
            field=models.CharField(default="Asia/Ho_Chi_Minh", max_length=64),
        ),
    ]
