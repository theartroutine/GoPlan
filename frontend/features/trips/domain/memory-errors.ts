type ErrorResponse = {
  response?: {
    data?: unknown;
  };
};

const ERROR_MESSAGES: Record<string, string> = {
  MEMORY_DELETE_BLOCKED: "Memory videos can only be deleted after rendering finishes.",
  MEMORY_INVALID_MUSIC: "Selected music track is not available.",
  MEMORY_INVALID_PHOTO_SELECTION: "Select between 5 and 50 photos.",
  MEMORY_FORBIDDEN: "You do not have permission to manage this memory video.",
  MEMORY_NOT_READY: "This memory video is not ready yet.",
  MEMORY_RENDER_FAILED: "Memory video rendering failed. Try creating it again.",
  TRIP_TERMINAL: "Cancelled trips cannot change memory videos.",
};

function getErrorData(error: unknown): unknown {
  return (error as ErrorResponse | null)?.response?.data;
}

function getErrorCode(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const code = (data as Record<string, unknown>).error_code;
  return typeof code === "string" && code.trim() ? code : null;
}

function getDetail(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const detail = (data as Record<string, unknown>).detail;
  return typeof detail === "string" && detail.trim() ? detail : null;
}

export function getTripMemoryErrorMessage(error: unknown, fallback: string): string {
  const data = getErrorData(error);
  const code = getErrorCode(data);
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return getDetail(data) ?? fallback;
}
