import Helper from '@ember/component/helper';
import { service } from '@ember/service';

export default class FormatCurrency extends Helper {
  @service region;

  compute([value]) {
    const num = Number(value);
    if (isNaN(num) || value === null || value === undefined || value === '') return '';

    const currency = this.region.currencyCode;
    const locale = navigator.language || 'en';

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
      }).format(num);
    } catch {
      return `${currency} ${num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }
}
