import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

const BLANK_FIELDS = {
  city: '',
  location: '',
  propertyNumber: '',
  kind: '',
  price: '',
  bedrooms: '',
  bathrooms: '',
  description: '',
  status: '',
  featPool: false,
  featGym: false,
  featParking: false,
  publish: false,
};

const FILLED_FLOATING = {
  small: 'Marina Tower',
  medium: 'Marina Tower',
  large: 'Marina Tower',
  search: 'Dubai Marina',
  notes: 'Corner unit, sea view',
  kind: 'villa',
};

const BLANK_FLOATING = {
  small: '',
  medium: '',
  large: '',
  search: '',
  notes: '',
  kind: '',
};

export default class NuvoFormController extends Controller {
  @tracked fields = { ...BLANK_FIELDS };
  @tracked errors = {};
  @tracked saved = false;
  @tracked floating = { ...BLANK_FLOATING };
  @tracked dropdownError = false;

  kindOptions = [
    { value: 'apartment', label: 'Apartment' },
    { value: 'villa', label: 'Villa' },
    { value: 'office', label: 'Office' },
  ];

  buildings = [
    { id: '1', name: 'Marina Tower' },
    { id: '2', name: 'Bay Square' },
    { id: '3', name: 'Palm Residence' },
  ];

  @action
  setField(name, value) {
    this.fields = { ...this.fields, [name]: value };
    if (this.errors[name]) {
      this.errors = { ...this.errors, [name]: undefined };
    }
    this.saved = false;
  }

  @action
  save(event) {
    event.preventDefault();
    const f = this.fields;
    const errors = {};
    if (!f.city.trim()) {
      errors.city = 'Choose a city';
    }
    if (!f.location.trim()) {
      errors.location = 'Choose a location';
    }
    if (!f.propertyNumber.trim()) {
      errors.propertyNumber = 'Enter a property number';
    }
    if (!f.kind) {
      errors.kind = 'Choose the property kind';
    }
    if (!f.status) {
      errors.status = 'Choose a status';
    }
    if (f.price !== '' && !(Number(f.price) > 0)) {
      errors.price = 'Enter a price greater than 0';
    }
    this.errors = errors;
    this.saved = Object.keys(errors).length === 0;
  }

  @action
  reset() {
    this.fields = { ...BLANK_FIELDS };
    this.errors = {};
    this.saved = false;
  }

  @action
  setFloating(name, value) {
    this.floating = { ...this.floating, [name]: value };
  }

  @action
  fillFloating() {
    this.floating = { ...FILLED_FLOATING };
  }

  @action
  clearFloating() {
    this.floating = { ...BLANK_FLOATING };
  }

  @action
  toggleDropdownError() {
    this.dropdownError = !this.dropdownError;
  }
}
