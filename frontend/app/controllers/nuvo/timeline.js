import Controller from '@ember/controller';

const VARIANT_NOTES = {
  primary: 'A milestone the user set, such as a viewing.',
  secondary: 'A routine system event.',
  success: 'A step that completed well: payment received, lease signed.',
  warning: 'A step that needs attention: reminder sent, cheque due.',
  danger: 'A failure: cheque bounced, request rejected.',
  info: 'A note or message.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class NuvoTimelineController extends Controller {
  variantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code: `<Nuvo::Timeline @compact={{true}}>
  <Nuvo::TimelineItem @title="${capitalize(variant)}" @variant="${variant}" @timestamp="12:00" @description="${capitalize(variant)} marker." />
</Nuvo::Timeline>`,
  }));

  code = {
    basic: `<Nuvo::Timeline>
  <Nuvo::TimelineItem @title="Created" @timestamp="09:14" @description="Lead captured from the website form." @meta="by Sara" />
  <Nuvo::TimelineItem @title="Contacted" @timestamp="11:02" @description="First WhatsApp message sent." />
</Nuvo::Timeline>`,
    complete: `<Nuvo::TimelineItem @title="Created" @timestamp="09:14" @complete={{true}} @description="Lead captured from the website form." />`,
    active: `<Nuvo::TimelineItem @title="Site visit" @timestamp="14:30" @active={{true}} @variant="warning" @description="Scheduled for Thursday." />`,
    compact: `<Nuvo::Timeline @compact={{true}}>
  <Nuvo::TimelineItem @title="Created" @timestamp="09:14" @description="Compact row." />
  <Nuvo::TimelineItem @title="Contacted" @timestamp="11:02" @description="Compact row." />
</Nuvo::Timeline>`,
    alternate: `<Nuvo::Timeline @alternate={{true}}>
  <Nuvo::TimelineItem @title="First" @description="Alternating layout." />
  <Nuvo::TimelineItem @title="Second" @description="Second item flips." />
  <Nuvo::TimelineItem @title="Third" @description="Third returns." />
</Nuvo::Timeline>`,
    blocks: `<Nuvo::Timeline>
  <Nuvo::TimelineItem @title="Payment received" @timestamp="Today">
    <:icon><Nuvo::Icon @icon="check" /></:icon>
    <:default><Nuvo::Badge @variant="success" @text="AED 8,500" /></:default>
  </Nuvo::TimelineItem>
</Nuvo::Timeline>`,
  };

  timelineArgRows = [
    { name: '@compact', type: 'boolean', default: 'false', description: 'Tighter rows.' },
    { name: '@alternate', type: 'boolean', default: 'false', description: 'Items alternate sides of the line.' },
  ];

  itemArgRows = [
    { name: '@title', type: 'string', default: '', description: 'Heading, rendered as h5.' },
    { name: '@timestamp', type: 'string', default: '', description: 'Time label beside the title.' },
    { name: '@description', type: 'string', default: '', description: 'Body text when no block is given.' },
    { name: '@meta', type: 'string', default: '', description: 'Small trailing line, for example the actor.' },
    { name: '@variant', type: '"primary" | "secondary" | "success" | "warning" | "danger" | "info"', default: '', description: 'Marker colour.' },
    { name: '@active', type: 'boolean', default: 'false', description: 'Highlights the marker as the current step.' },
    { name: '@complete', type: 'boolean', default: 'false', description: 'Marks the step as done.' },
  ];

  itemBlockRows = [
    { name: 'default', description: 'Body content; replaces @description.' },
    { name: 'icon', description: 'Glyph in the heading row, aria-hidden.' },
  ];
}
