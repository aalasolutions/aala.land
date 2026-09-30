// Port of rocicorp/fractional-indexing src/index.js (CC0, commit 648d2e60705b), fixed to its
// default alphabets. https://github.com/rocicorp/fractional-indexing
// Keys are ASCII and compare correctly in JavaScript and under COLLATE "C".

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const INT_DIGITS = DIGITS.slice(10);
const ZERO = DIGITS[0];
const SMALLEST_INTEGER = INT_DIGITS[0] + ZERO.repeat(INT_DIGITS.length / 2);

function digitValue(digit: string): number {
  return DIGITS.indexOf(digit);
}

function midpoint(a: string, b: string | null): string {
  if (b != null && a >= b) {
    throw new Error(a + ' >= ' + b);
  }
  if (a.slice(-1) === ZERO || (b && b.slice(-1) === ZERO)) {
    throw new Error('trailing zero');
  }
  if (b) {
    let n = 0;
    while ((a[n] || ZERO) === b[n]) {
      n++;
    }
    if (n > 0) {
      return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
    }
  }
  const digitA = a ? digitValue(a[0]) : 0;
  const digitB = b != null ? digitValue(b[0]) : DIGITS.length;
  if (digitB - digitA > 1) {
    return DIGITS[Math.round(0.5 * (digitA + digitB))];
  }
  if (b && b.length > 1) {
    return b.slice(0, 1);
  }
  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

function getIntegerLength(head: string): number {
  const i = INT_DIGITS.indexOf(head);
  if (i === -1) {
    throw new Error('invalid order key head: ' + head);
  }
  const half = INT_DIGITS.length / 2;
  return i < half ? half - i + 1 : i - half + 2;
}

function validateInteger(int: string): void {
  if (int.length !== getIntegerLength(int[0])) {
    throw new Error('invalid integer part of order key: ' + int);
  }
}

function getIntegerPart(key: string): string {
  const integerPartLength = getIntegerLength(key[0]);
  if (integerPartLength > key.length) {
    throw new Error('invalid order key: ' + key);
  }
  return key.slice(0, integerPartLength);
}

function validateOrderKey(key: string): void {
  if (key === SMALLEST_INTEGER) {
    throw new Error('invalid order key: ' + key);
  }
  const i = getIntegerPart(key);
  const f = key.slice(i.length);
  if (f.slice(-1) === ZERO) {
    throw new Error('invalid order key: ' + key);
  }
}

// Null past the largest integer.
function incrementInteger(x: string): string | null {
  validateInteger(x);
  const head = x[0];
  let trailing = '';
  for (let i = x.length - 1; i >= 1; i--) {
    const d = digitValue(x[i]) + 1;
    if (d === DIGITS.length) {
      trailing = ZERO + trailing;
    } else {
      return head + x.slice(1, i) + DIGITS[d] + trailing;
    }
  }
  const headIndex = INT_DIGITS.indexOf(head);
  if (headIndex === INT_DIGITS.length - 1) {
    return null;
  }
  const h = INT_DIGITS[headIndex + 1];
  const lengthDelta = getIntegerLength(h) - getIntegerLength(head);
  return (
    h +
    (lengthDelta > 0
      ? trailing + ZERO
      : lengthDelta < 0
        ? trailing.slice(1)
        : trailing)
  );
}

// Null past the smallest integer.
function decrementInteger(x: string): string | null {
  validateInteger(x);
  const head = x[0];
  const last = DIGITS[DIGITS.length - 1];
  let trailing = '';
  for (let i = x.length - 1; i >= 1; i--) {
    const d = digitValue(x[i]) - 1;
    if (d === -1) {
      trailing = last + trailing;
    } else {
      return head + x.slice(1, i) + DIGITS[d] + trailing;
    }
  }
  const headIndex = INT_DIGITS.indexOf(head);
  if (headIndex === 0) {
    return null;
  }
  const h = INT_DIGITS[headIndex - 1];
  const lengthDelta = getIntegerLength(h) - getIntegerLength(head);
  return (
    h +
    (lengthDelta > 0
      ? trailing + last
      : lengthDelta < 0
        ? trailing.slice(1)
        : trailing)
  );
}

// A key between a and b; null means the start or the end of the list.
export function generateKeyBetween(a: string | null, b: string | null): string {
  if (a != null) validateOrderKey(a);
  if (b != null) validateOrderKey(b);
  if (a != null && b != null && a > b) {
    [a, b] = [b, a];
  }

  if (a == null) {
    if (b == null) {
      return INT_DIGITS[INT_DIGITS.length / 2] + ZERO;
    }
    const ib = getIntegerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) {
      return ib + midpoint('', fb);
    }
    if (ib < b) {
      return ib;
    }
    const res = decrementInteger(ib);
    if (res == null) {
      throw new Error('cannot decrement any more');
    }
    return res;
  }

  if (b == null) {
    const ia = getIntegerPart(a);
    const fa = a.slice(ia.length);
    const i = incrementInteger(ia);
    return i == null ? ia + midpoint(fa, null) : i;
  }

  const ia = getIntegerPart(a);
  const fa = a.slice(ia.length);
  const ib = getIntegerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) {
    return ia + midpoint(fa, fb);
  }
  const i = incrementInteger(ia);
  if (i == null) {
    throw new Error('cannot increment any more');
  }
  if (i < b) {
    return i;
  }
  return ia + midpoint(fa, null);
}

// n distinct keys between a and b, in ascending order.
export function generateNKeysBetween(
  a: string | null,
  b: string | null,
  n: number,
): string[] {
  if (n < 0) {
    throw new Error('n must be >= 0: ' + n);
  }
  if (n === 0) {
    return [];
  }
  if (n === 1) {
    return [generateKeyBetween(a, b)];
  }
  if (b == null) {
    let c = generateKeyBetween(a, b);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(c, b);
      result.push(c);
    }
    return result;
  }
  if (a == null) {
    let c = generateKeyBetween(a, b);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(a, c);
      result.push(c);
    }
    result.reverse();
    return result;
  }
  const mid = Math.floor(n / 2);
  const c = generateKeyBetween(a, b);
  return [
    ...generateNKeysBetween(a, c, mid),
    c,
    ...generateNKeysBetween(c, b, n - mid - 1),
  ];
}

const JITTER_LENGTH = 3;

// Random suffix so concurrent inserts at the same spot almost never produce equal keys.
export function generateJitteredKeyBetween(
  a: string | null,
  b: string | null,
): string {
  if (a != null && b != null && a > b) {
    [a, b] = [b, a];
  }
  let key = generateKeyBetween(a, b);
  // A suffix on a prefix of b could sort past b, so step down toward a.
  while (b != null && b.startsWith(key)) {
    key = generateKeyBetween(a, key);
  }
  let suffix = '';
  for (let i = 0; i < JITTER_LENGTH - 1; i++) {
    suffix += DIGITS[Math.floor(Math.random() * DIGITS.length)];
  }
  return (
    key + suffix + DIGITS[1 + Math.floor(Math.random() * (DIGITS.length - 1))]
  );
}
