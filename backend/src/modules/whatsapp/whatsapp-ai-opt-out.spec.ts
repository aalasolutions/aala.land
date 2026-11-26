import {
  OPT_CONFIRMATIONS,
  classifyOptSignals,
  stopCounts,
} from './whatsapp-ai-opt-out';

describe('stopCounts', () => {
  it.each([
    'ab zaroorat nahi, shukriya',
    'baad mein dekhenge',
    'thanks, bye',
    'khuda hafiz',
    'JazakAllah bas',
    'khalas shukran bye',
    'بس شكرا',
    'stop, too expensive, anything cheaper?',
    'stop showing me Business Bay',
    'STOP sending Karachi, only Dubai',
    'Dubai wali listings mat bhejo',
    "don't message me after 10pm please",
    'no call please',
    'how do I unsubscribe?',
  ])('never opts out on %j, even when the classifier says stop', (text) => {
    expect(stopCounts(text, true)).toBe(false);
  });

  it.each([
    'stop sending me messages',
    'stop messaging me',
    'please stop, no more messages',
    'توقف عن مراسلتي',
  ])('takes the classifier stop on %j', (text) => {
    expect(stopCounts(text, true)).toBe(true);
    expect(stopCounts('please stop', false)).toBe(false);
  });

  it.each([
    'unsubscribe me, never again',
    "Don't send me Karachi listings or anything else ever again, unsubscribe",
    'mat bhejo mujhe kuch bhi, band karo messages',
    'stop sending me these flats, just stop everything, unsubscribe me',
    "Stop everything. I don't want messages on weekends or any other day.",
    'never message me again',
  ])('opts out on a full stop whatever the classifier says: %j', (text) => {
    expect(stopCounts(text, false)).toBe(true);
  });
});

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
