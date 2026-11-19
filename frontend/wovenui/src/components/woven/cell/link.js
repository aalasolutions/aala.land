import Component from '@glimmer/component';
import { get } from '@ember/object';

export default class WovenCellLinkComponent extends Component {
  get route() {
    return this.args.route ?? this.args.column?.cellArgs?.route;
  }

  get models() {
    const { models, model, row, column } = this.args;
    if (models) return models;
    if (model !== undefined && model !== null) return [model];
    const paths = column?.cellArgs?.modelPaths;
    if (paths) return paths.map((path) => get(row, path));
    return [get(row ?? {}, column?.cellArgs?.modelPath ?? 'id')];
  }
}
