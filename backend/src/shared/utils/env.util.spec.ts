import {
  envString,
  envRequired,
  envInt,
  envFloat,
  envBool,
  envList,
} from './env.util';

const KEY = 'ENV_UTIL_TEST_VAR';
const KEY2 = 'ENV_UTIL_TEST_VAR_2';

describe('env.util', () => {
  const originalValues = new Map<string, string | undefined>();

  beforeEach(() => {
    originalValues.set(KEY, process.env[KEY]);
    originalValues.set(KEY2, process.env[KEY2]);
    delete process.env[KEY];
    delete process.env[KEY2];
  });

  afterEach(() => {
    for (const [name, value] of originalValues) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  describe('envString', () => {
    it('returns undefined when unset and no fallback given', () => {
      expect(envString(KEY)).toBeUndefined();
    });

    it('returns undefined when blank and no fallback given', () => {
      process.env[KEY] = '   ';
      expect(envString(KEY)).toBeUndefined();
    });

    it('trims a value with surrounding whitespace', () => {
      process.env[KEY] = '  hello  ';
      expect(envString(KEY)).toBe('hello');
    });

    it('returns fallback when unset', () => {
      expect(envString(KEY, 'default')).toBe('default');
    });

    it('returns fallback when blank after trim', () => {
      process.env[KEY] = '   ';
      expect(envString(KEY, 'default')).toBe('default');
    });

    it('returns trimmed value over fallback when set', () => {
      process.env[KEY] = '  value  ';
      expect(envString(KEY, 'default')).toBe('value');
    });
  });

  describe('envRequired', () => {
    it('returns the trimmed value when set', () => {
      process.env[KEY] = '  required-value  ';
      expect(envRequired(KEY)).toBe('required-value');
    });

    it('throws with the name and without the value when unset', () => {
      expect(() => envRequired(KEY)).toThrow(`${KEY} is not set`);
    });

    it('throws with the name and without the value when blank', () => {
      process.env[KEY] = '   ';
      let caught: Error | undefined;
      try {
        envRequired(KEY);
      } catch (error) {
        caught = error as Error;
      }
      expect(caught?.message).toBe(`${KEY} is not set`);
      expect(caught?.message).not.toContain('   ');
    });
  });

  describe('envInt', () => {
    it('parses a valid integer', () => {
      process.env[KEY] = '42';
      expect(envInt(KEY, 0)).toBe(42);
    });

    it('parses a trimmed integer', () => {
      process.env[KEY] = '  42  ';
      expect(envInt(KEY, 0)).toBe(42);
    });

    it('returns fallback for a fully malformed value', () => {
      process.env[KEY] = 'abc';
      expect(envInt(KEY, 7)).toBe(7);
    });

    it('parseInt reads a leading numeric prefix: "12abc" resolves to 12', () => {
      process.env[KEY] = '12abc';
      expect(envInt(KEY, 7)).toBe(12);
    });

    it('returns fallback when parsed value is below min', () => {
      process.env[KEY] = '5';
      expect(envInt(KEY, 100, 10)).toBe(100);
    });

    it('allows 0 when min is omitted', () => {
      process.env[KEY] = '0';
      expect(envInt(KEY, 99)).toBe(0);
    });

    it('allows negative values when min is omitted', () => {
      process.env[KEY] = '-5';
      expect(envInt(KEY, 99)).toBe(-5);
    });

    it('returns fallback when unset', () => {
      expect(envInt(KEY, 3)).toBe(3);
    });
  });

  describe('envFloat', () => {
    it('parses a valid float', () => {
      process.env[KEY] = '3.14';
      expect(envFloat(KEY, 0)).toBe(3.14);
    });

    it('returns fallback for a malformed value', () => {
      process.env[KEY] = 'not-a-number';
      expect(envFloat(KEY, 1.5)).toBe(1.5);
    });

    it('returns fallback when blank', () => {
      process.env[KEY] = '   ';
      expect(envFloat(KEY, 1.5)).toBe(1.5);
    });
  });

  describe('envBool', () => {
    it('parses "true"', () => {
      process.env[KEY] = 'true';
      expect(envBool(KEY, false)).toBe(true);
    });

    it('parses "TRUE" case-insensitively', () => {
      process.env[KEY] = 'TRUE';
      expect(envBool(KEY, false)).toBe(true);
    });

    it('parses " False " with surrounding whitespace', () => {
      process.env[KEY] = ' False ';
      expect(envBool(KEY, true)).toBe(false);
    });

    it('returns fallback for an unrecognized value like "yes"', () => {
      process.env[KEY] = 'yes';
      expect(envBool(KEY, true)).toBe(true);
      expect(envBool(KEY, false)).toBe(false);
    });

    it('returns fallback when unset', () => {
      expect(envBool(KEY, true)).toBe(true);
      expect(envBool(KEY, false)).toBe(false);
    });
  });

  describe('envList', () => {
    it('parses a normal comma-separated list', () => {
      process.env[KEY] = 'a,b,c';
      expect(envList(KEY, [])).toEqual(['a', 'b', 'c']);
    });

    it('trims spaces around items', () => {
      process.env[KEY] = ' a , b , c ';
      expect(envList(KEY, [])).toEqual(['a', 'b', 'c']);
    });

    it('drops empty items from a trailing comma', () => {
      process.env[KEY] = 'a,b,';
      expect(envList(KEY, [])).toEqual(['a', 'b']);
    });

    it('returns fallback when the value is only commas', () => {
      process.env[KEY] = ',,,';
      expect(envList(KEY, ['default'])).toEqual(['default']);
    });

    it('returns fallback when unset', () => {
      expect(envList(KEY, ['default'])).toEqual(['default']);
    });

    it('returns a copy of the fallback array, not the same reference', () => {
      const fallback = ['default'];
      const result = envList(KEY, fallback);
      result.push('mutated');
      expect(envList(KEY, fallback)).toEqual(['default']);
      expect(fallback).toEqual(['default']);
    });
  });

  describe('reads per call', () => {
    it('reflects a process.env change made between two calls', () => {
      process.env[KEY] = 'first';
      expect(envString(KEY)).toBe('first');
      process.env[KEY] = 'second';
      expect(envString(KEY)).toBe('second');
    });

    it('reflects env changes across envInt calls with no caching', () => {
      process.env[KEY2] = '1';
      expect(envInt(KEY2, 0)).toBe(1);
      process.env[KEY2] = '2';
      expect(envInt(KEY2, 0)).toBe(2);
    });
  });
});
