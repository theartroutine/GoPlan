type ErrorResponse = {
  response?: {
    status?: unknown;
    data?: unknown;
  };
};

export function getExpenseErrorMessage(error: unknown, fallback: string): string {
  const data = (error as ErrorResponse | null)?.response?.data;
  return extractErrorMessage(data) ?? fallback;
}

export function getExpenseErrorStatus(error: unknown): number | null {
  const status = (error as ErrorResponse | null)?.response?.status;
  return typeof status === "number" ? status : null;
}

export function getExpenseErrorCode(error: unknown): string | null {
  const data = (error as ErrorResponse | null)?.response?.data;
  if (!data || typeof data !== "object") return null;
  const code = (data as Record<string, unknown>).error_code;
  return typeof code === "string" && code.trim() ? code : null;
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
