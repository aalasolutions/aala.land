import { JwtSignOptions } from '@nestjs/jwt';
import { envString } from '@shared/utils/env.util';

// Plain seconds, or a number with a unit, as jsonwebtoken accepts.
const EXPIRES_IN = /^\d+$|^\d+(\.\d+)?\s*(ms|s|m|h|d|w|y)$/i;

export function jwtExpiresIn(): JwtSignOptions['expiresIn'] {
  const value = envString('JWT_EXPIRES_IN', '24h');
  if (!EXPIRES_IN.test(value)) {
    throw new Error(
      `Invalid JWT_EXPIRES_IN "${value}" (use e.g. 3600, 15m, 24h, 7d)`,
    );
  }
  return value as JwtSignOptions['expiresIn'];
}
