import { assertEquals } from '@std/assert';
import axios, { FaxiosError, FaxiosHeaders, CanceledError } from 'axios';

Deno.test('Deno importing: default export is callable', () => {
  assertEquals(typeof axios, 'function');
});

Deno.test('Deno importing: named exports are functions', () => {
  assertEquals(typeof FaxiosError, 'function');
  assertEquals(typeof CanceledError, 'function');
  assertEquals(typeof FaxiosHeaders, 'function');
});

Deno.test('Deno importing: named exports match axios properties', () => {
  assertEquals(axios.FaxiosError, FaxiosError);
  assertEquals(axios.CanceledError, CanceledError);
  assertEquals(axios.FaxiosHeaders, FaxiosHeaders);
});
