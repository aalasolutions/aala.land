import Component from '@glimmer/component';
import { action } from '@ember/object';

// One lead card on a kanban board; the board decides which secondary fields it shows.
export default class LeadsKanbanCardComponent extends Component {
  get isPipelineBoard() {
    return this.args.board === 'pipeline';
  }

  get isTemperatureBoard() {
    return this.args.board === 'temperature';
  }

  get isAgentBoard() {
    return this.args.board === 'agent';
  }

  @action stopPropagation(event) {
    event.stopPropagation();
  }
}
