type ErrorResponse = {
  response?: {
    data?: unknown;
  };
};

export function getExpenseErrorMessage(error: unknown, fallback: string): string {
  const data = (error as ErrorResponse | null)?.response?.data;
  return extractErrorMessage(data) ?? fallback;
}

function extractErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  const detail = record.detail;
  if (typeof detail === "string" && detail.trim()) return detail;

  const nonFieldErrors = record.non_field_errors;
  const nonFieldMessage = extractFirstMessage(nonFieldErrors);
  if (nonFieldMessage) return nonFieldMessage;

  for (const [field, value] of Object.entries(record)) {
    const message = extractFirstMessage(value);
    if (message) return `${field}: ${message}`;
  }

  return null;
}

function extractFirstMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!Array.isArray(value)) return null;

  for (const item of value) {
    if (typeof item === "string" && item.trim()) return item;
    if (item && typeof item === "object" && "message" in item) {
      const message = (item as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }

  return null;
}
