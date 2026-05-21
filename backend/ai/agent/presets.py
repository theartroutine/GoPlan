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
    Preset("Buổi sáng", "08:00", "11:00"),
    Preset("Buổi chiều", "14:00", "17:00"),
    Preset("Buổi tối", "19:00", "22:00"),
]

_BY_SYSTEM_TYPE: dict[str, list[Preset]] = {
    "SIGHTSEEING": [
        Preset("Buổi sáng", "08:00", "11:00"),
        Preset("Buổi chiều", "14:00", "17:00"),
    ],
    "FOOD": [
        Preset("Bữa sáng", "07:00", "08:30"),
        Preset("Bữa trưa", "11:30", "13:00"),
        Preset("Bữa tối", "18:30", "20:30"),
    ],
    "DINING": [
        Preset("Bữa sáng", "07:00", "08:30"),
        Preset("Bữa trưa", "11:30", "13:00"),
        Preset("Bữa tối", "18:30", "20:30"),
    ],
    "NIGHTLIFE": [
        Preset("Buổi tối", "19:00", "22:00"),
        Preset("Khuya", "22:00", "23:59"),
    ],
}


def presets_for(system_type: str) -> list[Preset]:
    return _BY_SYSTEM_TYPE.get(system_type, _DEFAULT)
