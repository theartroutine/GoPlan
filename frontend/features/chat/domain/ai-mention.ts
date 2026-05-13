export const GOPLAN_AI_MENTION = "@GoPlanAI";
const GOPLAN_AI_PATTERN = /@GoPlanAI\b/gi;

export type GoPlanAIMentionParseResult = {
  hasMention: boolean;
  prompt: string;
  displayContent: string;
};

export function parseGoPlanAIMention(value: string): GoPlanAIMentionParseResult {
  const hasMention = GOPLAN_AI_PATTERN.test(value);
  GOPLAN_AI_PATTERN.lastIndex = 0;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!hasMention) {
    return { hasMention: false, prompt: normalized, displayContent: normalized };
  }
  const prompt = value.replace(GOPLAN_AI_PATTERN, " ").trim().replace(/\s+/g, " ");
  return {
    hasMention: true,
    prompt,
    displayContent: prompt ? `${GOPLAN_AI_MENTION} ${prompt}` : GOPLAN_AI_MENTION,
  };
}
