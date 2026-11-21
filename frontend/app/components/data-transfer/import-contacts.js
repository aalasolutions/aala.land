import Component from '@glimmer/component';

export const CONTACT_INTRO =
  'Use the sample file as your starting point. Each row needs a first name and a phone number. Rows that already exist are skipped. Up to 5,000 rows and 5 MB.';

export const CONTACT_VALUE_COLUMNS = [
  { name: 'First Name', valuePath: 'firstName', width: 140 },
  { name: 'Last Name', valuePath: 'lastName', width: 140 },
  { name: 'Phone', valuePath: 'phone', width: 150 },
  { name: 'Email', valuePath: 'email', width: 200 },
  { name: 'Region', valuePath: 'regionCode', width: 110 },
];

export default class DataTransferImportContactsComponent extends Component {
  intro = CONTACT_INTRO;
  valueColumns = CONTACT_VALUE_COLUMNS;
  nouns = { singular: 'contact', plural: 'contacts' };
}
