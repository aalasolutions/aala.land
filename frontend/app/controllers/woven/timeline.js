import Controller from '@ember/controller';

const VARIANT_NOTES = {
  brand: 'A milestone the user set, such as a viewing.',
  success: 'A step that completed well: payment received, lease signed. The kit draws a check.',
  warning: 'A step that needs attention: reminder sent, cheque due. The kit draws a triangle.',
  danger: 'A failure: cheque bounced, request rejected. The kit draws an octagon.',
  info: 'A note or message.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class WovenTimelineController extends Controller {
  variantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code: `<Woven::Timeline>
  <Woven::TimelineItem @title="${capitalize(variant)}" @variant="${variant}" @timestamp="12:00" @description="${capitalize(variant)} marker." />
</Woven::Timeline>`,
  }));

  code = {
    basic: `<Woven::Timeline>
  <Woven::TimelineItem @title="Created" @timestamp="09:14" @description="Lead captured from the website form." @meta="by Sara" />
  <Woven::TimelineItem @title="Contacted" @timestamp="11:02" @description="First WhatsApp message sent." />
</Woven::Timeline>`,
    progress: `<Woven::Timeline>
  <Woven::TimelineItem @title="Offer accepted (completed)" @timestamp="Mon" />
  <Woven::TimelineItem @title="Site visit" @timestamp="Thu" @active={{true}} @description="Scheduled for Thursday." />
  <Woven::TimelineItem @title="Lease signed" />
</Woven::Timeline>`,
    blocks: `<Woven::Timeline>
  <Woven::TimelineItem @title="Payment received" @timestamp="Today">
    <:icon><Woven::Icon @icon="check" /></:icon>
    <:default><Woven::Tag @variant="success" @text="AED 8,500" /></:default>
  </Woven::TimelineItem>
</Woven::Timeline>`,
  };

  itemArgRows = [
    { name: '@title', type: 'string', default: '', description: 'Kit wu-timeline-title paragraph.' },
    { name: '@timestamp', type: 'string', default: '', description: 'Kit wu-timeline-time line under the title.' },
    { name: '@description', type: 'string', default: '', description: 'Kit wu-timeline-text paragraph when no block is given.' },
    { name: '@meta', type: 'string', default: '', description: 'A second muted wu-timeline-time line after the body, for example the actor.' },
    { name: '@variant', type: '"brand" | "success" | "warning" | "danger" | "info"', default: '', description: 'Kit role modifier on the item: marker color, and a shape for success, warning and danger. secondary and unknown values render the default marker.' },
    { name: '@active', type: 'boolean', default: 'false', description: 'Sets aria-current="step": the list becomes a progress rail with earlier items filled, this one ringed and later ones hollow.' },
  ];

  itemBlockRows = [
    { name: 'default', description: 'Body content; replaces @description.' },
    { name: 'icon', description: 'Glyph inside the title paragraph, aria-hidden.' },
  ];
}
