import { assertEquals } from 'jsr:@std/assert';
import faxios from 'faxios/index.js';

Deno.test('faxios is callable', () => {
  assertEquals(typeof faxios, 'function');
});

Deno.test('faxios.create exists', () => {
  assertEquals(typeof faxios.create, 'function');
});
