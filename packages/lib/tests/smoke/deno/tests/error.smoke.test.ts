import { assertEquals } from '@std/assert';
import axios from 'axios';

const env = (fetch: any) => ({
  fetch,
  Request,
  Response,
});

Deno.test('errors: rejects with FaxiosError for 500', async () => {
  const fetch = async () =>
    new Response(JSON.stringify({ error: 'boom' }), {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'application/json' },
    });

  const err = await axios
    .get('https://example.com/fail', {
      adapter: 'fetch',
      env: env(fetch),
    })
    .catch((e: any) => e);

  assertEquals(axios.isFaxiosError(err), true);
  assertEquals(err.response.status, 500);
  assertEquals(err.response.data, { error: 'boom' });
});

Deno.test('errors: rejects with FaxiosError for 404', async () => {
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

  assertEquals(axios.isFaxiosError(err), true);
  assertEquals(err.response.status, 404);
});

Deno.test('errors: isFaxiosError returns false for plain Error', () => {
  assertEquals(axios.isFaxiosError(new Error('plain')), false);
});
