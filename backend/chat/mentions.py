from __future__ import annotations

import re

GOPLAN_AI_MENTION = "@GoPlanAI"
GOPLAN_AI_PATTERN = re.compile(r"@GoPlanAI\b", re.IGNORECASE)


def extract_goplan_ai_prompt(content: str) -> tuple[bool, str, str]:
    has_mention = GOPLAN_AI_PATTERN.search(content) is not None
    if not has_mention:
        normalized = " ".join(content.strip().split())
        return False, normalized, normalized

    prompt = GOPLAN_AI_PATTERN.sub(" ", content)
    prompt = " ".join(prompt.strip().split())
    display_content = f"{GOPLAN_AI_MENTION} {prompt}".strip()
    return True, prompt, display_content
