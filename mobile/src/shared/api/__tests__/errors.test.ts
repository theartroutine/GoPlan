import { AxiosError, AxiosHeaders } from 'axios';
import { normalizeApiError } from '../errors';

function axiosErrorWith(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  });
}

describe('normalizeApiError', () => {
  it('maps detail + error_code responses', () => {
    const result = normalizeApiError(
      axiosErrorWith(403, { detail: 'Please verify your email address before signing in.', error_code: 'EMAIL_NOT_VERIFIED' }),
    );
    expect(result).toEqual({
      kind: 'message',
      message: 'Please verify your email address before signing in.',
      errorCode: 'EMAIL_NOT_VERIFIED',
      status: 403,
    });
  });

  it('maps DRF field errors to first message per field', () => {
    const result = normalizeApiError(
      axiosErrorWith(400, { email: ['Enter a valid email address.'], password: ['This password is too short.', 'x'] }),
    );
    expect(result.kind).toBe('field');
    expect(result.fieldErrors).toEqual({
      email: 'Enter a valid email address.',
      password: 'This password is too short.',
    });
  });

  it('maps lone non_field_errors to a message error', () => {
    const result = normalizeApiError(axiosErrorWith(400, { non_field_errors: ['Something failed.'] }));
    expect(result).toMatchObject({ kind: 'message', message: 'Something failed.' });
  });

  it('maps 429 to throttled', () => {
    const result = normalizeApiError(axiosErrorWith(429, { detail: 'Request was throttled.' }));
    expect(result.kind).toBe('throttled');
  });

  it('maps missing response to network error', () => {
    const config = { headers: new AxiosHeaders() };
    const error = new AxiosError('Network Error', 'ERR_NETWORK', config, {});
    expect(normalizeApiError(error).kind).toBe('network');
  });

  it('maps unknown values to a generic message', () => {
    expect(normalizeApiError(new Error('boom'))).toEqual({
      kind: 'message',
      message: 'Something went wrong. Please try again.',
    });
  });
});
