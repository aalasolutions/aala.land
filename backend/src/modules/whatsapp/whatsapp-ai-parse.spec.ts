import {
  amountsIn,
  parseAmount,
  parseBudgetText,
  parseCurrency,
} from './whatsapp-ai-parse';

describe('parseAmount', () => {
  it.each([
    ['8,000', 8000],
    ['8k', 8000],
    ['1.5 lakh', 150000],
    ['2 crore', 20000000],
    ['saadhe 5 crore', 55000000],
    ['dedh lakh', 150000],
    ['sawa lakh', 125000],
    ['پونے لاکھ', 75000],
    ['پونے دو لاکھ', 175000],
    ['سوا لاکھ', 125000],
    ['1 lakh 70', 170000],
    ['1 arab', 1000000000],
    ['50 hazar', 50000],
    ['٥٠ ألف', 50000],
    ['ایک لاکھ چالیس ہزار', 140000],
    ['Rs.50,000', 50000],
  ])('reads %j as %d', (text, amount) => {
    expect(parseAmount(text).amount).toBe(amount);
  });

  it('reads the currency beside the amount', () => {
    expect(parseAmount('AED 8000')).toEqual({
      amount: 8000,
      currency: 'AED',
      unknownCurrency: undefined,
    });
  });

  it('never reads an object key as a currency or a number', () => {
    expect(parseCurrency('constructor')).toBeUndefined();
    expect(parseAmount('constructor').amount).toBeUndefined();
  });
});

describe('parseBudgetText', () => {
  it.each([
    ['dedh lakh', { maxPrice: 150000 }],
    ['under 80k a month', { maxPrice: 80000, period: 'month' }],
    ['٥٠ ألف', { maxPrice: 50000 }],
    ['1-2 lakh', { minPrice: 100000, maxPrice: 200000 }],
    ['AED 120k/yr', { maxPrice: 120000, currency: 'AED', period: 'year' }],
    ['above 2 crore', { minPrice: 20000000 }],
    ['sawa lakh se zyada', { minPrice: 125000 }],
    [
      'between 50000 and 70000 per month',
      { minPrice: 50000, maxPrice: 70000, period: 'month' },
    ],
    ['1.5m dirhams', { maxPrice: 1500000, currency: 'AED' }],
    ['ایک لاکھ چالیس ہزار ماہانہ', { maxPrice: 140000, period: 'month' }],
  ])('reads %j', (text, expected) => {
    expect(parseBudgetText(text)).toEqual(expected);
  });

  it('reads a number as the highest budget and nothing from empty text', () => {
    expect(parseBudgetText(90000)).toEqual({ maxPrice: 90000 });
    expect(parseBudgetText('')).toEqual({});
    expect(parseBudgetText('cheap please')).toEqual({});
  });

  it('keeps a euro budget as an unknown currency', () => {
    expect(parseBudgetText('€2000')).toMatchObject({
      maxPrice: 2000,
      unknownCurrency: 'EUR',
    });
  });
});

describe('amountsIn', () => {
  it('reads figures written in words in a staff line', () => {
    expect(amountsIn('کرایہ اب ایک لاکھ چالیس ہزار ہے')).toEqual([140000]);
    expect(amountsIn('rent for 1806 is now 95k')).toEqual([1806, 95000]);
  });
});
