import Component from '@glimmer/component';
import { service } from '@ember/service';
import { contactName } from 'land/utils/contact-display';
import { daysUntil } from 'land/utils/local-date';
import { formatMoney } from 'land/utils/money';
import { localeForRegion } from 'land/utils/locale';
import { plural } from 'land/utils/plural';
import { primaryRole } from 'land/utils/contact-role';
import { regionCurrencyFor } from 'land/utils/region-name';

export default class ContactSummaryComponent extends Component {
  @service region;

  get name() {
    return contactName(this.args.contact, 'Contact');
  }

  get totals() {
    return this.args.totals ?? {};
  }

  get role() {
    return primaryRole({ totals: this.args.totals });
  }

  money(value, currency) {
    return formatMoney(value, localeForRegion(this.region.activeRegion), {
      currency: currency ?? this.region.currencyCode,
      compact: true,
    });
  }

  leadLine(lead) {
    const where = lead.locality?.name ? ` in ${lead.locality.name}` : '';
    const want = lead.unit?.unitNumber
      ? `Interested in ${lead.unit.unitNumber}`
      : `Looking for a property${where}`;
    const currency = regionCurrencyFor(this.region.regions, lead.regionCode);
    let budget = '';
    if (lead.budgetMin && lead.budgetMax) {
      budget = `, budget ${this.money(lead.budgetMin, currency)} to ${this.money(lead.budgetMax, currency)}`;
    } else if (lead.budgetMin || lead.budgetMax) {
      budget = `, budget ${this.money(lead.budgetMin || lead.budgetMax, currency)}`;
    }
    const temp = lead.temperature
      ? `${lead.temperature.charAt(0)}${lead.temperature.slice(1).toLowerCase()} lead`
      : 'Open lead';
    const agent = lead.assignedAgentName
      ? `, with ${lead.assignedAgentName}`
      : ', not assigned yet';
    return `${want}${budget}. ${temp}${agent}.`;
  }

  tenantLine(lease) {
    const unit = lease.unit?.unitNumber ?? 'a property';
    const rent = lease.monthlyRent
      ? `, ${this.money(lease.monthlyRent, lease.currency)} a month`
      : '';
    const left = daysUntil(lease.endDate);
    let ends = '';
    if (left === 0) {
      ends = ', ends today';
    } else if (left !== null && left > 0) {
      ends = `, ends in ${plural(left, 'day')}`;
    } else if (left !== null) {
      ends = `, end date passed ${plural(-left, 'day')} ago`;
    }
    return `Rents ${unit}${rent}${ends}.`;
  }

  ownerLine() {
    const { units = 0, availableUnits: available = 0 } = this.totals;
    const owns = `Owns ${plural(units, 'property', 'properties')}`;
    return available ? `${owns}, ${available} marked available.` : `${owns}.`;
  }

  get relationship() {
    if (this.role === 'lead')
      return this.leadLine(this.args.firstOpenLead ?? {});
    if (this.role === 'tenant') {
      return this.tenantLine(this.args.firstActiveLease ?? {});
    }
    if (this.role === 'owner') return this.ownerLine();
    return 'No open leads, leases or properties yet.';
  }

  get alsoLine() {
    const { openLeads = 0, activeLeases = 0, units = 0 } = this.totals;
    const also = [];
    if (openLeads > 1) {
      also.push(plural(openLeads - 1, 'more open lead', 'more open leads'));
    }
    const leading = this.role;
    if (leading !== 'tenant' && activeLeases) {
      also.push(`rents ${plural(activeLeases, 'property', 'properties')}`);
    }
    if (leading !== 'owner' && units) {
      also.push(`owns ${plural(units, 'property', 'properties')}`);
    }
    return also.length ? `Also ${also.join(', ')}.` : '';
  }
}
