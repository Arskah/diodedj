import { describe, it, expect } from 'vitest';
import { formatTime, sanitizeSearchQuery } from '../utils';

describe('formatTime', () => {
  it('formats zero', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats seconds to m:ss', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(180)).toBe('3:00');
    expect(formatTime(3661)).toBe('61:01');
  });

  it('pads single-digit seconds', () => {
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(61)).toBe('1:01');
  });

  it('handles NaN', () => {
    expect(formatTime(NaN)).toBe('0:00');
  });
});

describe('sanitizeSearchQuery', () => {
  it('trims whitespace', () => {
    expect(sanitizeSearchQuery('  hello  ')).toBe('hello');
  });

  it('strips quotes', () => {
    expect(sanitizeSearchQuery(`"test's"`)).toBe('tests');
  });

  it('handles empty string', () => {
    expect(sanitizeSearchQuery('')).toBe('');
  });
});
