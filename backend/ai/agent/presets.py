from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class Preset:
    label: str
    start: str  # "HH:MM"
    end: str

    def as_dict(self) -> dict:
        return {"label": self.label, "start": self.start, "end": self.end}


_DEFAULT = [
    Preset("Morning", "08:00", "11:00"),
    Preset("Afternoon", "14:00", "17:00"),
    Preset("Evening", "19:00", "22:00"),
]

_BY_SYSTEM_TYPE: dict[str, list[Preset]] = {
    "SIGHTSEEING": [Preset("Morning", "08:00", "11:00"), Preset("Afternoon", "14:00", "17:00")],
    "FOOD": [
        Preset("Breakfast", "07:00", "08:30"),
        Preset("Lunch", "11:30", "13:00"),
        Preset("Dinner", "18:30", "20:30"),
    ],
    "DINING": [
        Preset("Breakfast", "07:00", "08:30"),
        Preset("Lunch", "11:30", "13:00"),
        Preset("Dinner", "18:30", "20:30"),
    ],
    "NIGHTLIFE": [Preset("Evening", "19:00", "22:00"), Preset("Late", "22:00", "23:59")],
}


def presets_for(system_type: str) -> list[Preset]:
    return _BY_SYSTEM_TYPE.get(system_type, _DEFAULT)
