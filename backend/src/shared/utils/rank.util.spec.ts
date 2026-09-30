import {
  generateJitteredKeyBetween,
  generateKeyBetween,
  generateNKeysBetween,
} from './rank.util';

function keyOrError(a: string | null, b: string | null): string {
  try {
    return generateKeyBetween(a, b);
  } catch (e) {
    return (e as Error).message;
  }
}

describe('generateKeyBetween', () => {
  // Upstream default-alphabet cases, verbatim.
  it.each([
    [null, null, 'a0'],
    [null, 'a0', 'Zz'],
    [null, 'Zz', 'Zy'],
    ['a0', null, 'a1'],
    ['a1', null, 'a2'],
    ['a0', 'a1', 'a0V'],
    ['a1', 'a2', 'a1V'],
    ['a0V', 'a1', 'a0l'],
    ['Zz', 'a0', 'ZzV'],
    ['Zz', 'a1', 'a0'],
    [null, 'Y00', 'Xzzz'],
    ['bzz', null, 'c000'],
    ['a0', 'a0V', 'a0G'],
    ['a0', 'a0G', 'a08'],
    ['b125', 'b129', 'b127'],
    ['a0', 'a1V', 'a1'],
    ['Zz', 'a01', 'a0'],
    [null, 'a0V', 'a0'],
    [null, 'b999', 'b99'],
    [
      null,
      'A00000000000000000000000000',
      'invalid order key: A00000000000000000000000000',
    ],
    [null, 'A000000000000000000000000001', 'A000000000000000000000000000V'],
    ['zzzzzzzzzzzzzzzzzzzzzzzzzzy', null, 'zzzzzzzzzzzzzzzzzzzzzzzzzzz'],
    ['zzzzzzzzzzzzzzzzzzzzzzzzzzz', null, 'zzzzzzzzzzzzzzzzzzzzzzzzzzzV'],
    ['a00', null, 'invalid order key: a00'],
    ['a00', 'a1', 'invalid order key: a00'],
    ['0', '1', 'invalid order key head: 0'],
    ['a1', 'a0', 'a0V'],
  ])('(%p, %p) gives %p', (a, b, expected) => {
    expect(keyOrError(a, b)).toBe(expected);
  });

  it('keeps keys short across 10,000 inserts at the top', () => {
    let first = generateKeyBetween(null, null);
    for (let i = 0; i < 10000; i++) {
      const next = generateKeyBetween(null, first);
      expect(next < first).toBe(true);
      first = next;
    }
    expect(first.length).toBeLessThanOrEqual(5);
  });
});

describe('generateNKeysBetween', () => {
  it('returns ascending unique keys', () => {
    for (const n of [0, 1, 2, 100, 5000]) {
      const keys = generateNKeysBetween(null, null, n);
      expect(keys).toHaveLength(n);
      expect(new Set(keys).size).toBe(n);
      expect([...keys].sort()).toEqual(keys);
    }
  });

  it('fills keys between two bounds', () => {
    const keys = generateNKeysBetween('a0', 'a1', 20);
    expect(keys.every((k) => k > 'a0' && k < 'a1')).toBe(true);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe('generateJitteredKeyBetween', () => {
  const bounds: [string | null, string | null][] = [
    [null, null],
    [null, 'a0'],
    ['a0', null],
    ['a0', 'a1'],
    [null, 'a0V'],
    ['a0', 'a01'],
    ['a04', 'a05V'],
    ['a1', 'a0'],
  ];

  it.each(bounds)('stays strictly between %p and %p', (a, b) => {
    for (let i = 0; i < 500; i++) {
      const key = generateJitteredKeyBetween(a, b);
      const [low, high] = a != null && b != null && a > b ? [b, a] : [a, b];
      if (low != null) expect(key > low).toBe(true);
      if (high != null) expect(key < high).toBe(true);
      expect(() => generateKeyBetween(key, null)).not.toThrow();
    }
  });

  it('gives distinct keys for inserts at the same spot', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      keys.add(generateJitteredKeyBetween('a0', 'a1'));
    }
    expect(keys.size).toBeGreaterThan(990);
  });

  it('keeps order across 1000 inserts at the top', () => {
    const keys = [generateJitteredKeyBetween(null, null)];
    for (let i = 0; i < 1000; i++) {
      keys.unshift(generateJitteredKeyBetween(null, keys[0]));
    }
    expect([...keys].sort()).toEqual(keys);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(8);
  });
});
