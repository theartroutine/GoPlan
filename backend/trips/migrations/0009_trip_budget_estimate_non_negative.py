from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("trips", "0008_timeline_activity_assignee_scope"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="trip",
            constraint=models.CheckConstraint(
                condition=Q(budget_estimate__isnull=True) | Q(budget_estimate__gte=0),
                name="trip_budget_estimate_non_negative",
            ),
        ),
    ]
