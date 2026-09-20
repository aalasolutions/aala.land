import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class NuvoSegmentedController extends Controller {
  @tracked segmentedView = 'pipeline';
  @tracked segmentedPeriod = 'week';
  @tracked segmentedAmenities = ['parking', 'pool'];

  segmentedViews = [
    { id: 'pipeline', label: 'Pipeline', icon: 'squares-four' },
    { id: 'temperature', label: 'Temperature', icon: 'thermometer' },
    { id: 'agent', label: 'Agent', icon: 'users' },
    { id: 'list', label: 'List', icon: 'list' },
  ];

  segmentedPlain = [
    { id: 'day', label: 'Day' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year', disabled: true },
  ];

  segmentedValueKeyed = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
  ];

  segmentedAmenityOptions = [
    { id: 'parking', label: 'Parking', icon: 'car' },
    { id: 'pool', label: 'Pool', icon: 'swimming-pool' },
    { id: 'gym', label: 'Gym', icon: 'barbell' },
    { id: 'security', label: 'Security', icon: 'shield-check' },
  ];

  @action
  updateSegmentedView(value) {
    this.segmentedView = value;
  }

  @action
  updateSegmentedPeriod(value) {
    this.segmentedPeriod = value;
  }

  @action
  updateSegmentedAmenities(values) {
    this.segmentedAmenities = values;
  }

  code = {
    icons: `<Nuvo::Segmented @options={{this.segmentedViews}} @value={{this.segmentedView}} @onChange={{this.updateSegmentedView}} />

// segmentedViews: [{ id: 'pipeline', label: 'Pipeline', icon: 'squares-four' }, ...]`,
    iconOnly: `<Nuvo::Segmented @options={{this.segmentedViews}} @value={{this.segmentedView}} @onChange={{this.updateSegmentedView}} @iconOnly={{true}} />`,
    plain: `<Nuvo::Segmented @options={{this.segmentedPlain}} @value={{this.segmentedPeriod}} @onChange={{this.updateSegmentedPeriod}} />

// segmentedPlain: [{ id: 'day', label: 'Day' }, ..., { id: 'year', label: 'Year', disabled: true }]`,
    valueKeyed: `<Nuvo::Segmented @options={{this.segmentedValueKeyed}} @value={{this.segmentedPeriod}} @onChange={{this.updateSegmentedPeriod}} />

// segmentedValueKeyed: [{ value: 'day', label: 'Day' }, ...]`,
    uncontrolled: `<Nuvo::Segmented @options={{this.segmentedPlain}} />`,
    sm: `<Nuvo::Segmented @options={{this.segmentedPlain}} @value={{this.segmentedPeriod}} @onChange={{this.updateSegmentedPeriod}} @size="sm" />`,
    lg: `<Nuvo::Segmented @options={{this.segmentedPlain}} @value={{this.segmentedPeriod}} @onChange={{this.updateSegmentedPeriod}} @size="lg" />`,
    multiple: `<Nuvo::Segmented
  @options={{this.segmentedAmenityOptions}}
  @value={{this.segmentedAmenities}}
  @onChange={{this.updateSegmentedAmenities}}
  @multiple={{true}}
/>`,
    fill: `<Nuvo::Segmented @options={{this.segmentedPlain}} @value={{this.segmentedPeriod}} @onChange={{this.updateSegmentedPeriod}} @fill={{true}} />`,
  };

  argRows = [
    { name: '@options', type: 'array', default: '[]', description: 'Objects with id (or value), label, optional icon (Phosphor name) and disabled.' },
    { name: '@value', type: 'string | array', default: '', description: 'Controlled value: one id, or an array of ids when @multiple. Omit for uncontrolled mode.' },
    { name: '@multiple', type: 'boolean', default: 'false', description: 'Several segments can be raised at once; the value is an array.' },
    { name: '@size', type: '"sm" | "lg"', default: '', description: 'Height step.' },
    { name: '@iconOnly', type: 'boolean', default: 'false', description: 'Hides labels visually; each segment keeps its label as a title.' },
    { name: '@fill', type: 'boolean', default: 'false', description: 'Segments split the container width equally.' },
  ];

  callbackRows = [
    { name: '@onChange', signature: '(value, option)', description: 'Single mode: the chosen id. Multiple mode: the next array of ids. The option object is passed second.' },
  ];
}
