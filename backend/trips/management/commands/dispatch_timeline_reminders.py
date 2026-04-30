from django.core.management.base import BaseCommand

from trips.services import dispatch_due_timeline_reminders


class Command(BaseCommand):
    help = "Dispatch due unsent timeline activity reminders."

    def handle(self, *args, **options):
        count = dispatch_due_timeline_reminders()
        self.stdout.write(f"Dispatched {count} timeline reminder notification(s).")
