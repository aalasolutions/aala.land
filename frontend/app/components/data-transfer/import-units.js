import Component from '@glimmer/component';

export const UNIT_INTRO =
  'Use the sample file as your starting point. Each row needs a City, Locality, Asset, Unit Number and Sub Type. A locality or asset that is not on file yet is created. Rows whose asset and unit number already exist are skipped. Up to 5,000 rows and 5 MB.';

export const UNIT_VALUE_COLUMNS = [
  { name: 'City', valuePath: 'city', width: 120 },
  { name: 'Locality', valuePath: 'locality', width: 140 },
  { name: 'Asset', valuePath: 'asset', width: 160 },
  { name: 'Unit Number', valuePath: 'unitNumber', width: 110 },
  { name: 'Sub Type', valuePath: 'subType', width: 120 },
  { name: 'Owner Phone', valuePath: 'ownerPhone', width: 150 },
];

// Units imported without an owner are listed after commit; the unit page route takes the locality, then the unit.
export const UNIT_NOTES = {
  route: 'properties.unit',
  fileStem: 'units-without-owner',
  summary: 'imported without an owner',
  columns: [
    { name: 'Asset', valuePath: 'asset', width: 160 },
    { name: 'Unit Number', valuePath: 'unitNumber', width: 110, link: true },
  ],
};

// The region comes from the city of each row, so the wizard shows no region picker.
export default class DataTransferImportUnitsComponent extends Component {
  intro = UNIT_INTRO;
  valueColumns = UNIT_VALUE_COLUMNS;
  nouns = { singular: 'property', plural: 'properties' };
  notes = UNIT_NOTES;
}
