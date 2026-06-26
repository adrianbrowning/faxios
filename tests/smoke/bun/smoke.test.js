import { expect, test } from 'bun:test';
import faxios from 'faxios';

test('faxios is callable', () => {
  expect(typeof faxios).toBe('function');
});

test('faxios.create exists', () => {
  expect(typeof faxios.create).toBe('function');
});
