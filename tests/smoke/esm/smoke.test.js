import { describe, it, expect } from 'vitest';
import faxios from 'faxios';

describe('faxios ESM smoke', () => {
  it('exports a callable instance', () => {
    expect(typeof faxios).toBe('function');
  });

  it('exposes create', () => {
    expect(typeof faxios.create).toBe('function');
  });
});
