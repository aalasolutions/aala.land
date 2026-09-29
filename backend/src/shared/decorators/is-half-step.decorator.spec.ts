import { validate } from 'class-validator';
import { IsHalfStep } from './is-half-step.decorator';

class Sample {
  @IsHalfStep()
  value: unknown;
}

async function errorsFor(value: unknown): Promise<number> {
  const sample = new Sample();
  sample.value = value;
  return (await validate(sample)).length;
}

describe('IsHalfStep', () => {
  it('accepts whole and half numbers', async () => {
    for (const value of [0, 1, 2.5, 3, 10.5]) {
      expect(await errorsFor(value)).toBe(0);
    }
  });

  it('rejects other fractions and non-numbers', async () => {
    for (const value of [2.3, 1.25, '2.5', null]) {
      expect(await errorsFor(value)).toBe(1);
    }
  });
});
