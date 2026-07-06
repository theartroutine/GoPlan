import { AxiosError } from 'axios';

export interface ApiError {
  kind: 'field' | 'message' | 'throttled' | 'network';
  message: string;
  errorCode?: string;
  fieldErrors?: Record<string, string>;
  status?: number;
}

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const NETWORK_MESSAGE = 'Cannot reach the server. Check your connection.';
const THROTTLED_MESSAGE = 'Too many attempts. Please wait a moment and try again.';

export function normalizeApiError(error: unknown): ApiError {
  if (!(error instanceof AxiosError)) {
    return { kind: 'message', message: GENERIC_MESSAGE };
  }
  if (!error.response) {
    return { kind: 'network', message: NETWORK_MESSAGE };
  }

  const { status, data } = error.response;
  if (status === 429) {
    return { kind: 'throttled', message: THROTTLED_MESSAGE, status };
  }

  if (data && typeof data === 'object') {
    const body = data as Record<string, unknown>;

    if (typeof body.detail === 'string') {
      return {
        kind: 'message',
        message: body.detail,
        status,
        ...(typeof body.error_code === 'string' ? { errorCode: body.error_code } : {}),
      };
    }

    const fieldErrors: Record<string, string> = {};
    for (const [field, value] of Object.entries(body)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first === 'string') {
        fieldErrors[field] = first;
      }
    }
    const fields = Object.keys(fieldErrors);
    if (fields.length === 1 && fields[0] === 'non_field_errors') {
      return { kind: 'message', message: fieldErrors.non_field_errors, status };
    }
    if (fields.length > 0) {
      return { kind: 'field', message: 'Please fix the highlighted fields.', fieldErrors, status };
    }
  }

  return { kind: 'message', message: GENERIC_MESSAGE, status };
}
