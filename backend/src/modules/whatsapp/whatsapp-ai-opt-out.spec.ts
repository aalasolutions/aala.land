import { OPT_CONFIRMATIONS, classifyOptSignals } from './whatsapp-ai-opt-out';

describe('classifyOptSignals', () => {
  it.each([
    ['STOP', 'en'],
    ['stop.', 'en'],
    ['Unsubscribe', 'en'],
    ['S T O P', 'en'],
    ['S.T.O.P', 'en'],
    ['СТОП', 'en'],
    ['ЅТОР', 'en'],
    ['بس کرو', 'ur'],
    ['بند کریں', 'ur'],
    ['bas karo', 'ur-Latn'],
    ['توقف', 'ar'],
    ['STOP\nstop', 'en'],
  ])('opts out on the exact word %j', (text, language) => {
    expect(classifyOptSignals(text)).toEqual({ signal: 'opt_out', language });
  });

  it.each([
    ['START', 'en'],
    ['شروع', 'ur'],
    ['ابدأ', 'ar'],
    ['shuru', 'ur-Latn'],
  ])('opts in on the exact word %j', (text, language) => {
    expect(classifyOptSignals(text)).toEqual({ signal: 'opt_in', language });
  });

  it.each([
    'stop, which one is cheapest?',
    'stop sending me Karachi listings',
    'STOP\njk',
    'please stop messaging me',
    'mat bhejo',
    'start the search again in Lahore',
    '',
  ])('leaves %j to the classifier', (text) => {
    expect(classifyOptSignals(text).signal).toBe('none');
  });
});

describe('fixed lines', () => {
  it('has every fixed line in the five fixed-line languages', () => {
    expect(Object.keys(OPT_CONFIRMATIONS).sort()).toEqual(
      ['ar', 'ar-Latn', 'en', 'ur', 'ur-Latn'].sort(),
    );
  });
});
