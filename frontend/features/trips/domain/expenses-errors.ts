import {
  extractApiErrorMessage,
  getApiErrorCode,
  getApiErrorData,
  getApiErrorStatus,
} from "@/shared/http/api-errors";

export function getExpenseErrorMessage(error: unknown, fallback: string): string {
  return extractApiErrorMessage(getApiErrorData(error)) ?? fallback;
}

export function getExpenseErrorStatus(error: unknown): number | null {
  return getApiErrorStatus(error);
}

export function getExpenseErrorCode(error: unknown): string | null {
  return getApiErrorCode(error);
}
