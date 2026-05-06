from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("expenses", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="expenseledgerentry",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("EXPENSE_CREATED", "Expense created"),
                    ("EXPENSE_UPDATED", "Expense updated"),
                    ("EXPENSE_DELETED", "Expense deleted"),
                    ("CONTRIBUTION_SET", "Contribution set"),
                    ("CONTRIBUTION_REMOVED", "Contribution removed"),
                    ("SETTLEMENT_FINALIZED", "Settlement finalized"),
                    ("SETTLEMENT_REOPENED", "Settlement reopened"),
                    ("TRANSFER_MARKED_SENT", "Transfer marked sent"),
                    ("TRANSFER_CONFIRMED_RECEIVED", "Transfer confirmed received"),
                ],
                max_length=32,
            ),
        ),
    ]
