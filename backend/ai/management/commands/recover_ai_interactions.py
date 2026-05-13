from __future__ import annotations

from django.core.management.base import BaseCommand

from ai.services import recover_stale_ai_interactions


class Command(BaseCommand):
    help = "Recover stale GoPlanAI interactions whose worker lock expired."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=50)

    def handle(self, *args, **options):
        result = recover_stale_ai_interactions(limit=options["limit"])
        self.stdout.write(
            "Recovered {recovered}, failed {failed}, skipped {skipped} "
            "GoPlanAI interactions.".format(**result)
        )
