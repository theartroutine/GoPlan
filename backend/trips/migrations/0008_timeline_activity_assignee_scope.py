from django.db import migrations, models


def set_existing_user_assignee_scope(apps, schema_editor):
    TimelineActivity = apps.get_model("trips", "TimelineActivity")
    TimelineActivity.objects.filter(assignee_user__isnull=False).update(
        assignee_scope="USER"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("trips", "0007_unique_timeline_section_date"),
    ]

    operations = [
        migrations.AddField(
            model_name="timelineactivity",
            name="assignee_scope",
            field=models.CharField(
                choices=[
                    ("NONE", "Unassigned"),
                    ("USER", "User"),
                    ("EVERYONE", "Everyone"),
                ],
                default="NONE",
                max_length=16,
            ),
        ),
        migrations.RunPython(
            set_existing_user_assignee_scope,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
