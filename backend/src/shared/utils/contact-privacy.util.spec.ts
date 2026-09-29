import {
  lastInitial,
  limitedDisplayName,
  maskPhone,
} from './contact-privacy.util';

describe('contact-privacy.util', () => {
  describe('maskPhone', () => {
    it.each([
      ['+971501234567', '+971 50 *** **67'],
      ['+971 50 123 4567', '+971 50 *** **67'],
      ['00971501234567', '+971 50 *** **67'],
      ['0501234567', '0 50 *** **67'],
      ['501234567', '50 *** **67'],
      ['+923001234567', '+923 00 *** **67'],
      ['12345678', '12 *** *78'],
      ['123456', '12 **56'],
      ['12345', '***45'],
      ['12', '12'],
    ])('masks %s as %s', (input, expected) => {
      expect(maskPhone(input)).toBe(expected);
    });

    it('returns null for an empty or digitless phone', () => {
      expect(maskPhone(null)).toBeNull();
      expect(maskPhone('')).toBeNull();
      expect(maskPhone('n/a')).toBeNull();
    });

    it('never exposes the masked middle digits', () => {
      expect(maskPhone('+971509876543')).not.toMatch(/9876/);
    });
  });

  describe('lastInitial', () => {
    it('gives the first letter and a period', () => {
      expect(lastInitial('al-Rashid')).toBe('A.');
      expect(lastInitial('  user ')).toBe('U.');
    });

    it('keeps a non-Latin first letter whole', () => {
      expect(lastInitial('علي')).toBe('ع.');
    });

    it('is empty without a last name', () => {
      expect(lastInitial(null)).toBe('');
      expect(lastInitial('   ')).toBe('');
    });
  });

  describe('limitedDisplayName', () => {
    it('joins first name and last initial', () => {
      expect(limitedDisplayName({ firstName: 'Test', lastName: 'User' })).toBe(
        'Test U.',
      );
    });

    it('falls back to the masked phone, never the raw one', () => {
      expect(
        limitedDisplayName({
          firstName: null,
          lastName: null,
          phone: '+971501234567',
        }),
      ).toBe('+971 50 *** **67');
    });

    it('is null with nothing to show', () => {
      expect(limitedDisplayName(null)).toBeNull();
      expect(limitedDisplayName({ firstName: null, phone: null })).toBeNull();
    });
  });
});
