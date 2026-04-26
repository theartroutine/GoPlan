from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone as dt_timezone

from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.tokens import AccessToken
from notifications.models import Notification, NotificationType
from test_helpers import create_completed_user
from trips.models import (
    MemberStatus,
    TimelineActivityReminder,
    TimelineActivityStatus,
    TimelineActivityTimeMode,
    TimelineSectionKind,
    TripMember,
    TripRole,
    TripStatus,
)
from trips.services import create_timeline_activity, patch_timeline_activity, update_trip
from trips.tests.timeline_helpers import make_timeline_activity, make_trip_with_timeline


def _auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


class TimelineReminderGenerationTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("captain@example.com", "captain", "CAP001")
        self.trip = make_trip_with_timeline(
            captain=self.captain,
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 1),
            timezone="Asia/Ho_Chi_Minh",
        )
        self.section = self.trip.timeline_sections.get(kind=TimelineSectionKind.SYSTEM_DAY)

    def test_create_timed_activity_generates_timezone_correct_reminders(self):
        activity = create_timeline_activity(
            self.trip.id,
            self.section.id,
            actor=self.captain,
            data={
                "title": "Bus to Da Lat",
                "time_mode": TimelineActivityTimeMode.AT_TIME,
                "start_time": time(9, 0),
                "system_type": "TRANSPORTATION",
                "location_mode": "MANUAL",
                "reminder_offsets_minutes": [120, 30],
            },
        )

        reminders = list(activity.reminders.order_by("-offset_minutes_before"))
        self.assertEqual([r.offset_minutes_before for r in reminders], [120, 30])
        self.assertEqual(
            reminders[0].due_at_utc,
            datetime(2026, 6, 1, 0, 0, tzinfo=dt_timezone.utc),
        )
        self.assertEqual(
            reminders[1].due_at_utc,
            datetime(2026, 6, 1, 1, 30, tzinfo=dt_timezone.utc),
        )

    def test_all_day_activity_does_not_generate_reminders(self):
        activity = create_timeline_activity(
            self.trip.id,
            self.section.id,
            actor=self.captain,
            data={
                "title": "Free day",
                "time_mode": TimelineActivityTimeMode.ALL_DAY,
                "start_time": None,
                "end_time": None,
                "system_type": "FREE_TIME",
                "location_mode": "MANUAL",
                "reminder_offsets_minutes": [30],
            },
        )

        self.assertEqual(activity.reminders.count(), 0)

    def test_patch_start_time_regenerates_unsent_reminders_only(self):
        activity = create_timeline_activity(
            self.trip.id,
            self.section.id,
            actor=self.captain,
            data={
                "title": "Breakfast",
                "time_mode": TimelineActivityTimeMode.AT_TIME,
                "start_time": time(9, 0),
                "system_type": "FOOD",
                "location_mode": "MANUAL",
                "reminder_offsets_minutes": [30],
            },
        )
        sent = activity.reminders.get()
        sent.sent_at = timezone.now()
        sent.save(update_fields=["sent_at"])

        patch_timeline_activity(
            self.trip.id,
            activity.id,
            actor=self.captain,
            data={"start_time": time(10, 0)},
        )

        reminders = list(activity.reminders.order_by("sent_at", "due_at_utc"))
        self.assertEqual(len(reminders), 2)
        self.assertIsNotNone(reminders[0].sent_at)
        self.assertEqual(
            reminders[1].due_at_utc,
            datetime(2026, 6, 1, 2, 30, tzinfo=dt_timezone.utc),
        )
        self.assertIsNone(reminders[1].sent_at)

    def test_trip_timezone_change_regenerates_unsent_reminders(self):
        activity = create_timeline_activity(
            self.trip.id,
            self.section.id,
            actor=self.captain,
            data={
                "title": "Museum",
                "time_mode": TimelineActivityTimeMode.AT_TIME,
                "start_time": time(9, 0),
                "system_type": "SIGHTSEEING",
                "location_mode": "MANUAL",
                "reminder_offsets_minutes": [30],
            },
        )

        update_trip(self.trip, timezone="UTC")

        reminder = activity.reminders.get()
        self.assertEqual(
            reminder.due_at_utc,
            datetime(2026, 6, 1, 8, 30, tzinfo=dt_timezone.utc),
        )

    def test_timeline_response_returns_configured_offsets(self):
        url = f"/api/trips/{self.trip.id}/timeline/sections/{self.section.id}/activities"
        response = self.client.post(
            url,
            {
                "title": "Coffee",
                "time_mode": "AT_TIME",
                "start_time": "09:00:00",
                "system_type": "FOOD",
                "location_mode": "MANUAL",
                "reminder_offsets_minutes": [120, 30],
            },
            format="json",
            **_auth(self.captain),
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["activity"]["reminder_offsets_minutes"], [120, 30])


class TimelineReminderDispatchTests(APITestCase):

    def setUp(self):
        self.captain = create_completed_user("captain@example.com", "captain", "CAP001")
        self.member = create_completed_user("member@example.com", "member", "MEM001")
        self.removed = create_completed_user("removed@example.com", "removed", "REM001")
        self.trip = make_trip_with_timeline(
            captain=self.captain,
            members=[self.member],
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 1),
            timezone="UTC",
        )
        TripMember.objects.create(
            trip=self.trip,
            user=self.removed,
            role=TripRole.MEMBER,
            status=MemberStatus.REMOVED,
        )
        self.section = self.trip.timeline_sections.get(kind=TimelineSectionKind.SYSTEM_DAY)

    def _activity_with_due_reminder(self, *, trip_status=TripStatus.PLANNING, activity_status=TimelineActivityStatus.UPCOMING):
        self.trip.status = trip_status
        self.trip.save(update_fields=["status"])
        activity = make_timeline_activity(
            trip=self.trip,
            section=self.section,
            title="Board train",
            time_mode=TimelineActivityTimeMode.AT_TIME,
            start_time=(timezone.now() + timedelta(minutes=5)).time(),
            status=activity_status,
            location_label="Central station",
        )
        return TimelineActivityReminder.objects.create(
            activity=activity,
            offset_minutes_before=30,
            due_at_utc=timezone.now() - timedelta(minutes=1),
        )

    def test_due_reminder_notifies_each_active_member_once(self):
        reminder = self._activity_with_due_reminder()

        call_command("dispatch_timeline_reminders")
        reminder.refresh_from_db()

        self.assertIsNotNone(reminder.sent_at)
        notifications = Notification.objects.filter(type=NotificationType.TRIP_TIMELINE_REMINDER)
        self.assertEqual(notifications.count(), 2)
        self.assertEqual(
            {n.recipient_id for n in notifications},
            {self.captain.id, self.member.id},
        )
        payload = notifications.first().payload
        self.assertEqual(payload["trip_id"], str(self.trip.id))
        self.assertEqual(payload["trip_name"], self.trip.name)
        self.assertEqual(payload["activity_id"], str(reminder.activity_id))
        self.assertEqual(payload["activity_title"], "Board train")
        self.assertEqual(payload["section_label"], self.section.label)
        self.assertEqual(payload["activity_date"], "2026-06-01")
        self.assertEqual(payload["location_label"], "Central station")

        call_command("dispatch_timeline_reminders")
        self.assertEqual(Notification.objects.filter(type=NotificationType.TRIP_TIMELINE_REMINDER).count(), 2)

    def test_terminal_trip_does_not_emit_reminder(self):
        reminder = self._activity_with_due_reminder(trip_status=TripStatus.COMPLETED)

        call_command("dispatch_timeline_reminders")
        reminder.refresh_from_db()

        self.assertIsNone(reminder.sent_at)
        self.assertEqual(Notification.objects.count(), 0)

    def test_cancelled_activity_does_not_emit_reminder(self):
        reminder = self._activity_with_due_reminder(activity_status=TimelineActivityStatus.CANCELLED)

        call_command("dispatch_timeline_reminders")
        reminder.refresh_from_db()

        self.assertIsNone(reminder.sent_at)
        self.assertEqual(Notification.objects.count(), 0)
