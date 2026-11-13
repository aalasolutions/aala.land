import Controller from '@ember/controller';

export default class WovenDividerController extends Controller {
  code = {
    plain: `<Woven::Divider />`,
    dashed: `<Woven::Divider @dashed={{true}} />`,
    label: `<Woven::Divider @label="OR" />`,
    block: `<Woven::Divider><Woven::Icon @icon="clock" /> Earlier today</Woven::Divider>`,
    vertical: `<span class="wu-text sm">Start</span>
<Woven::Divider @vertical={{true}} />
<span class="wu-text sm">End</span>`,
  };

  argRows = [
    { name: '@vertical', type: 'boolean', default: 'false', description: 'Sets aria-orientation="vertical" on the hr; the kit stretches it to the row height. Ignored on a labeled divider.' },
    { name: '@dashed', type: 'boolean', default: 'false', description: 'Kit dashed modifier, also on the lines beside a label.' },
    { name: '@label', type: 'string', default: '', description: 'Centered text between two lines when no block is given; renders a div instead of an hr.' },
  ];

  blockRows = [
    { name: 'default', description: 'Label content. Takes precedence over @label.' },
  ];
}
