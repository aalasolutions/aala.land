import { jwtExpiresIn } from './jwt-expires-in';

describe('jwtExpiresIn', () => {
  const original = process.env.JWT_EXPIRES_IN;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.JWT_EXPIRES_IN;
    } else {
      process.env.JWT_EXPIRES_IN = original;
    }
  });

  it('defaults to 24h when unset or blank', () => {
    delete process.env.JWT_EXPIRES_IN;
    expect(jwtExpiresIn()).toBe('24h');
    process.env.JWT_EXPIRES_IN = '   ';
    expect(jwtExpiresIn()).toBe('24h');
  });

  it.each(['3600', '15m', '24h', '7d', '1.5h', '2 d', '500ms', '1Y'])(
    'accepts %s',
    (value) => {
      process.env.JWT_EXPIRES_IN = value;
      expect(jwtExpiresIn()).toBe(value);
    },
  );

  it.each(['abc', '24hours', '-5m', 'h24', '2 days'])(
    'refuses %s at startup',
    (value) => {
      process.env.JWT_EXPIRES_IN = value;
      expect(() => jwtExpiresIn()).toThrow(`Invalid JWT_EXPIRES_IN "${value}"`);
    },
  );
});
