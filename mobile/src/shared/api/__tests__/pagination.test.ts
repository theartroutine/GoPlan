import { extractCursor, toCursorPage } from '../pagination';

describe('extractCursor', () => {
  it('returns null when the pagination URL is absent or has no cursor', () => {
    expect(extractCursor(null)).toBeNull();
    expect(extractCursor('http://testserver/api/friends/')).toBeNull();
    expect(extractCursor('http://testserver/api/friends/?cursor=')).toBeNull();
  });

  it('extracts and decodes the opaque cursor from an absolute DRF URL', () => {
    expect(
      extractCursor('http://testserver/api/friends/?cursor=abc%2B%2F%3D&page=2'),
    ).toBe('abc+/=');
  });

  it('returns null instead of throwing for a malformed encoded cursor', () => {
    expect(extractCursor('http://testserver/api/friends/?cursor=%E0%A4%A')).toBeNull();
  });
});

describe('toCursorPage', () => {
  it('maps a DRF cursor response to the mobile page shape', () => {
    expect(
      toCursorPage({
        next: 'http://testserver/api/friends/?cursor=next%3D%3D',
        previous: null,
        results: [{ id: 'friend-1' }],
      }),
    ).toEqual({
      items: [{ id: 'friend-1' }],
      nextCursor: 'next==',
    });
  });
});
