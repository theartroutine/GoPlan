from django.test import SimpleTestCase
from ai.agent.presets import presets_for


class PresetsTests(SimpleTestCase):
    def test_food_presets_include_three_meals(self):
        presets = [p.as_dict() for p in presets_for("FOOD")]
        labels = {p["label"] for p in presets}
        self.assertEqual(labels, {"Breakfast", "Lunch", "Dinner"})

    def test_dining_presets_include_three_meals(self):
        presets = [p.as_dict() for p in presets_for("DINING")]
        labels = {p["label"] for p in presets}
        self.assertEqual(labels, {"Breakfast", "Lunch", "Dinner"})

    def test_sightseeing_presets(self):
        presets = [p.as_dict() for p in presets_for("SIGHTSEEING")]
        self.assertEqual([p["label"] for p in presets], ["Morning", "Afternoon"])

    def test_unknown_system_type_returns_default_set(self):
        presets = [p.as_dict() for p in presets_for("WEIRD")]
        labels = {p["label"] for p in presets}
        self.assertEqual(labels, {"Morning", "Afternoon", "Evening"})
