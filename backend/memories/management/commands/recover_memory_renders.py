from __future__ import annotations

from django.core.management.base import BaseCommand

from memories.memory_video_services import recover_stale_memory_renders


class Command(BaseCommand):
    help = "Recover stale trip memory video renders whose worker was lost."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=25)

    def handle(self, *args, **options):
        result = recover_stale_memory_renders(limit=options["limit"])
        self.stdout.write(
            "Requeued {requeued}, failed {failed}, skipped {skipped} "
            "trip memory renders.".format(**result)
        )
