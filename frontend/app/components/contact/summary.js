import Component from '@glimmer/component';
import { service } from '@ember/service';
import { contactName } from 'land/utils/contact-display';
import { daysUntil } from 'land/utils/local-date';
import { formatMoney } from 'land/utils/money';
import { localeForRegion } from 'land/utils/locale';

const CLOSED_LEAD = ['WON', 'LOST'];

function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

export default class ContactSummaryComponent extends Component {
  @service region;

  get name() {
    return contactName(this.args.contact, 'Contact');
  }

  get units() {
    return this.args.units ?? [];
  }

  get activeLeases() {
    return (this.args.leases ?? []).filter(
      (l) => l.status === 'ACTIVE' && !l.deletedAt,
    );
  }

  get openLeads() {
    return (this.args.leads ?? []).filter(
      (l) => !CLOSED_LEAD.includes(l.status),
    );
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
    let budget = '';
    if (lead.budgetMin && lead.budgetMax) {
      budget = `, budget ${this.money(lead.budgetMin)} to ${this.money(lead.budgetMax)}`;
    } else if (lead.budgetMin || lead.budgetMax) {
      budget = `, budget ${this.money(lead.budgetMin || lead.budgetMax)}`;
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
    const units = this.units;
    const available = units.filter((u) => u.status === 'available').length;
    const owns = `Owns ${plural(units.length, 'property', 'properties')}`;
    return available ? `${owns}, ${available} available.` : `${owns}.`;
  }

  get relationship() {
    const lines = [];
    if (this.openLeads.length) lines.push(this.leadLine(this.openLeads[0]));
    if (this.activeLeases.length) {
      lines.push(this.tenantLine(this.activeLeases[0]));
    }
    if (this.units.length) lines.push(this.ownerLine());
    return lines[0] ?? 'No open leads, leases or properties yet.';
  }

  get alsoLine() {
    const also = [];
    if (this.openLeads.length > 1) {
      also.push(
        `${this.openLeads.length - 1} more open lead${this.openLeads.length > 2 ? 's' : ''}`,
      );
    }
    const leading = this.openLeads.length
      ? 'lead'
      : this.activeLeases.length
        ? 'tenant'
        : 'owner';
    if (leading !== 'tenant' && this.activeLeases.length) {
      also.push(
        `rents ${plural(this.activeLeases.length, 'property', 'properties')}`,
      );
    }
    if (leading !== 'owner' && this.units.length) {
      also.push(`owns ${plural(this.units.length, 'property', 'properties')}`);
    }
    return also.length ? `Also ${also.join(', ')}.` : '';
  }
}
