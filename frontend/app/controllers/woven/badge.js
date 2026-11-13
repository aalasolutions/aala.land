import Controller from '@ember/controller';

const VARIANT_NOTES = {
  default: 'Neutral gray for a plain count that carries no judgment.',
  brand: 'Brand tint for the count the user is looking for: new, assigned to me.',
  success: 'Completed, paid, active. Green means the thing is in the state you want.',
  warning: 'Attention soon: expiring, pending, due this week.',
  danger: 'Overdue, failed, blocked. Red is for states that need action now.',
  info: 'Informational context such as a source or a channel; blue without urgency.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class WovenBadgeController extends Controller {
  variantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code:
      variant === 'default'
        ? '<Woven::Badge @value="Default" />'
        : `<Woven::Badge @variant="${variant}" @value="${capitalize(variant)}" />`,
  }));

  code = {
    solid: `<Woven::Badge @variant="brand" @solid={{true}} @value="Solid" />`,
    zero: `<Woven::Badge @variant="warning" @value={{0}} />`,
    dot: `<Woven::Badge @variant="secondary" @isDot={{true}} />`,
    text: `<Woven::Badge @variant="success" @text="Active" />`,
    count: `<Woven::Badge @count={{true}} @value={{3}} />
<Woven::Badge @count={{true}} @variant="brand" @value={{12}} />
<Woven::Badge @count={{true}} @variant="success" @value={{99}} />`,
    countMax: `<Woven::Badge @count={{true}} @variant="info" @value={{250}} @max={{99}} />`,
    countDot: `<Woven::Badge @count={{true}} @variant="danger" @isDot={{true}} />`,
    max: `<Woven::Badge @variant="danger" @value={{120}} @max={{99}} />`,
    wrapped: `<Woven::Badge @variant="danger" @value={{5}}>
  <Woven::Button @icon="envelope" @shape="square" aria-label="Messages" />
</Woven::Badge>`,
    wrappedDot: `<Woven::Badge @variant="success" @isDot={{true}}>
  <Woven::Button @icon="bell" @shape="square" aria-label="Notifications" />
</Woven::Badge>`,
    wrappedZero: `<Woven::Badge @variant="brand" @value={{0}}>
  <Woven::Button @icon="star" @shape="square" aria-label="Favorites" />
</Woven::Badge>`,
    hidden: `<Woven::Badge @variant="danger" @value={{7}} @hidden={{true}}>
  <Woven::Button @icon="chat-circle" @shape="square" aria-label="Chats" />
</Woven::Badge>`,
  };

  argRows = [
    { name: '@variant', type: '"brand" | "success" | "warning" | "danger" | "info"', default: '', description: 'Kit role modifier of the same name. secondary and unknown values render the neutral badge.' },
    { name: '@value', type: 'string | number', default: '', description: 'Displayed content. 0 still displays; with a block, null or undefined hides the corner bubble.' },
    { name: '@text', type: 'string', default: '', description: 'Alias of @value for label-style badges. @value wins when both are given.' },
    { name: '@max', type: 'number', default: '', description: 'Numeric cap; a larger @value renders as "{max}+".' },
    { name: '@solid', type: 'boolean', default: 'false', description: 'Kit solid modifier: filled background with inverted text.' },
    { name: '@isDot', type: 'boolean', default: 'false', description: 'Renders a kit wu-dot with no value; never hidden for lacking one.' },
    { name: '@count', type: 'boolean', default: 'false', description: 'Standalone solid count (wu-badge solid) with no anchor element; danger when no @variant is passed.' },
    { name: '@hidden', type: 'boolean', default: 'false', description: 'With a block: hides the corner bubble while keeping the wrapped content. No effect on an inline badge.' },
  ];

  blockRows = [
    { name: 'default', description: 'Content to anchor the bubble to. When present the badge becomes a corner bubble (wu-badge-host + corner) instead of an inline pill.' },
  ];
}
