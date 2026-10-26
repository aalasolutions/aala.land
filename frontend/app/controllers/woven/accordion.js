import Controller from '@ember/controller';

export default class WovenAccordionController extends Controller {
  accordionItems = [
    {
      id: 'unit-details',
      title: 'Unit Details',
      content: 'Unit 1204, Marina Tower - 2BR, sea view, 1,450 sqft.',
    },
    {
      id: 'lease-terms',
      title: 'Lease Terms',
      content: 'AED 8,500/month, 12-month term, renews 31 Dec 2026.',
    },
    {
      id: 'cheque-schedule',
      title: 'Cheque Schedule',
      content: '4 post-dated cheques, next due 1 Sep 2026.',
    },
    {
      id: 'maintenance-log',
      title: 'Maintenance Log',
      content: 'No open requests. Last service: AC, 12 Jun 2026.',
      disabled: true,
    },
  ];

  code = {
    basic: `<Woven::Accordion @items={{this.accordionItems}} />

// accordionItems: [{ id, title, content }, ..., { id, title, content, disabled: true }]`,
    multiple: `<Woven::Accordion @items={{this.accordionItems}} @multiple={{true}} />`,
    defaultExpanded: `<Woven::Accordion @items={{this.accordionItems}} @defaultExpanded="lease-terms" />`,
    defaultExpandedMany: `<Woven::Accordion @items={{this.accordionItems}} @multiple={{true}} @defaultExpanded={{array "unit-details" "cheque-schedule"}} />`,
    bordered: `<Woven::Accordion @items={{this.accordionItems}} @bordered={{true}} />`,
    flush: `<Woven::Card @title="Inside a card">
  <Woven::Accordion @items={{this.accordionItems}} @flush={{true}} />
</Woven::Card>`,
    compact: `<Woven::Accordion @items={{this.accordionItems}} @compact={{true}} />`,
    block: `<Woven::Accordion @items={{this.accordionItems}} as |entry|>
  <Woven::Text @size="sm" @text={{entry.content}} />
  <Woven::Tag @size="sm" @variant="info" @text={{entry.id}} />
</Woven::Accordion>`,
  };

  argRows = [
    { name: '@items', type: 'array', default: '[]', description: 'Objects with id, title, content and optional disabled.' },
    { name: '@multiple', type: 'boolean', default: 'false', description: 'Allow several panels open at once. Otherwise opening one closes the rest.' },
    { name: '@defaultExpanded', type: 'string | array', default: '', description: 'Item id, or ids, expanded on first render. Internal state after that.' },
    { name: '@bordered', type: 'boolean', default: 'false', description: 'Border around the whole accordion.' },
    { name: '@flush', type: 'boolean', default: 'false', description: 'No outer border or radius, for use inside a card.' },
    { name: '@compact', type: 'boolean', default: 'false', description: 'Tighter trigger and panel padding.' },
  ];

  blockRows = [
    { name: 'default', description: 'Panel content, yielded the item (with an added expanded flag). Replaces item.content.' },
  ];
}
