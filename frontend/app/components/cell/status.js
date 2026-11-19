import Component from '@glimmer/component';

export default class CellStatus extends Component {
  get domain() {
    return this.args.domain ?? this.args.column?.cellArgs?.domain;
  }

  get value() {
    const map = this.args.valueMap ?? this.args.column?.cellArgs?.valueMap;
    const value = this.args.value;
    return map && Object.hasOwn(map, String(value)) ? map[value] : value;
  }
}
