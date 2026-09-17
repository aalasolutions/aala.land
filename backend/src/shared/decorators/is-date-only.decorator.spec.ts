import { validateSync } from 'class-validator';
import { IsDateOnly } from './is-date-only.decorator';

class Sample {
  @IsDateOnly()
  day: unknown;
}

function errorsFor(day: unknown) {
  const sample = new Sample();
  sample.day = day;
  return validateSync(sample);
}

describe('IsDateOnly', () => {
  it('accepts a real calendar date, including a leap day', () => {
    expect(errorsFor('2028-02-29')).toHaveLength(0);
  });

  it.each([
    ['an impossible date', '2026-02-31'],
    ['a full ISO timestamp', '2026-09-16T00:00:00.000Z'],
    ['year zero', '0000-01-01'],
    ['an empty string', ''],
    ['a number', 20260916],
  ])('rejects %s', (_label, value) => {
    const errors = errorsFor(value);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual({
      isDateOnly: 'day must be a valid date in YYYY-MM-DD format',
    });
  });

  it('honours a custom message', () => {
    class Custom {
      @IsDateOnly({ message: 'bad day' })
      day: unknown = 'nope';
    }
    expect(validateSync(new Custom())[0].constraints).toEqual({
      isDateOnly: 'bad day',
    });
  });
});
