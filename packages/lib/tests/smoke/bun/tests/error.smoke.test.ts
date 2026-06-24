import { describe, expect, test } from 'bun:test';
import axios from 'axios';

const env = (fetch: typeof globalThis.fetch) => ({
  fetch,
  Request,
  Response,
});

describe('errors', () => {
  test('non-2xx response rejects with FaxiosError and status 404', async () => {
    const fetch = async () =>
      new Response(JSON.stringify({ error: 'missing' }), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'application/json' },
      });

    const err = await axios
      .get('https://example.com/missing', {
        adapter: 'fetch',
        env: env(fetch),
      })
      .catch((e: any) => e);

    expect(axios.isFaxiosError(err)).toBe(true);
    expect(err.response.status).toBe(404);
  });

  test('axios.isFaxiosError returns false for a plain Error', () => {
    expect(axios.isFaxiosError(new Error('plain'))).toBe(false);
  });
});
