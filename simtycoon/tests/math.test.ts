import { describe, expect, it } from 'vitest';
import { clamp, lerp } from '@utils/math';

describe('clamp', () => {
  it('returns the value when inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps below the minimum', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it('clamps above the maximum', () => {
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it('throws when min is greater than max', () => {
    expect(() => clamp(0, 10, 0)).toThrow(RangeError);
  });
});

describe('lerp', () => {
  it('returns a at t=0', () => {
    expect(lerp(2, 8, 0)).toBe(2);
  });

  it('returns b at t=1', () => {
    expect(lerp(2, 8, 1)).toBe(8);
  });

  it('interpolates linearly', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});
