import Controller from '@ember/controller';

export default class WovenDividerController extends Controller {
  code = {
    plain: `<Woven::Divider />`,
    dashed: `<Woven::Divider @dashed={{true}} />`,
    label: `<Woven::Divider @label="OR" />`,
    start: `<Woven::Divider @labelPosition="start" @label="Section start" />`,
    end: `<Woven::Divider @labelPosition="end" @label="Section end" />`,
    block: `<Woven::Divider><Woven::Icon @icon="clock" /> Earlier today</Woven::Divider>`,
    vertical: `<span class="wu-text m-sm">Start</span>
<Woven::Divider @vertical={{true}} />
<span class="wu-text m-sm">End</span>`,
  };

  argRows = [
    { name: '@vertical', type: 'boolean', default: 'false', description: 'Vertical rule that fills the height of a flex row.' },
    { name: '@dashed', type: 'boolean', default: 'false', description: 'Dashed line style.' },
    { name: '@label', type: 'string', default: '', description: 'Text rendered on the line when no block is given.' },
    { name: '@labelPosition', type: '"start" | "end"', default: '', description: 'Moves the label from the centre to the start or end of the line.' },
  ];

  blockRows = [
    { name: 'default', description: 'Label content. Takes precedence over @label.' },
  ];
}
