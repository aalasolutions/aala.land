import Component from '@glimmer/component';

export default class CellLabel extends Component {
  get domain() {
    return this.args.domain ?? this.args.column?.cellArgs?.domain;
  }
}
