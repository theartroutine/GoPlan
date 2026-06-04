import {
  extractApiErrorMessage,
  getApiErrorCode,
  getApiErrorData,
} from "@/shared/http/api-errors";

const ERROR_MESSAGES: Record<string, string> = {
  MEMORY_DELETE_BLOCKED: "Memory videos can only be deleted after rendering finishes.",
  MEMORY_INVALID_MUSIC: "Selected music track is not available.",
  MEMORY_INVALID_PHOTO_SELECTION: "Select between 5 and 50 photos.",
  MEMORY_FORBIDDEN: "You do not have permission to manage this memory video.",
  MEMORY_NOT_READY: "This memory video is not ready yet.",
  MEMORY_RENDER_FAILED: "Memory video rendering failed. Try creating it again.",
  MEMORY_RENDER_TRIP_LIMIT_REACHED: "This trip already has too many memory videos rendering.",
  TRIP_TERMINAL: "Cancelled trips cannot change memory videos.",
};

export function getTripMemoryErrorMessage(error: unknown, fallback: string): string {
  const data = getApiErrorData(error);
  const code = getApiErrorCode(error);
  const detail = extractApiErrorMessage(data);
  if (code === "MEMORY_INVALID_PHOTO_SELECTION" && detail) return detail;
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return detail ?? fallback;
}
