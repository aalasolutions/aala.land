import Controller from '@ember/controller';

export default class NuvoDividerController extends Controller {
  code = {
    plain: `<Nuvo::Divider />`,
    dashed: `<Nuvo::Divider @dashed={{true}} />`,
    label: `<Nuvo::Divider @label="OR" />`,
    start: `<Nuvo::Divider @labelPosition="start" @label="Section start" />`,
    end: `<Nuvo::Divider @labelPosition="end" @label="Section end" />`,
    block: `<Nuvo::Divider><Nuvo::Icon @icon="clock" /> Earlier today</Nuvo::Divider>`,
    vertical: `<span class="nu-text m-sm">Start</span>
<Nuvo::Divider @vertical={{true}} />
<span class="nu-text m-sm">End</span>`,
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
