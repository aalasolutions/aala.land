import Controller from '@ember/controller';

const VARIANT_NOTES = {
  default: 'Neutral grey for labels that carry no judgement: a type, a category, a plain count.',
  primary: 'Brand-coloured highlight for the state the user is looking for: current, featured, new.',
  secondary: 'A second neutral tone to separate two kinds of label on the same row.',
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
    solid: `<Woven::Badge @variant="primary" @solid={{true}} @value="Solid" />`,
    outline: `<Woven::Badge @variant="success" @outline={{true}} @value="Outline" />`,
    pill: `<Woven::Badge @variant="info" @pill={{true}} @value="Pill" />`,
    quiet: `<Woven::Badge @variant="warning" @quiet={{true}} @value="Quiet" />`,
    sm: `<Woven::Badge @variant="danger" @size="sm" @value="Small" />`,
    lg: `<Woven::Badge @variant="danger" @size="lg" @value="Large" />`,
    zero: `<Woven::Badge @variant="warning" @value={{0}} />`,
    dot: `<Woven::Badge @variant="secondary" @isDot={{true}} />`,
    text: `<Woven::Badge @variant="success" @text="Active" />`,
    count: `<Woven::Badge @count={{true}} @value={{3}} />
<Woven::Badge @count={{true}} @variant="primary" @value={{12}} />
<Woven::Badge @count={{true}} @variant="success" @value={{99}} />`,
    countMax: `<Woven::Badge @count={{true}} @variant="info" @value={{250}} @max={{99}} />`,
    countDot: `<Woven::Badge @count={{true}} @variant="danger" @isDot={{true}} />`,
    max: `<Woven::Badge @variant="danger" @value={{120}} @max={{99}} />`,
    wrapped: `<Woven::Badge @variant="danger" @value={{5}}>
  <Woven::Button @variant="secondary" @icon="envelope" @shape="square" aria-label="Messages" />
</Woven::Badge>`,
    wrappedDot: `<Woven::Badge @variant="success" @isDot={{true}}>
  <Woven::Button @variant="secondary" @icon="bell" @shape="square" aria-label="Notifications" />
</Woven::Badge>`,
    wrappedZero: `<Woven::Badge @variant="primary" @value={{0}}>
  <Woven::Button @variant="secondary" @icon="star" @shape="square" aria-label="Favourites" />
</Woven::Badge>`,
    hidden: `<Woven::Badge @variant="danger" @value={{7}} @hidden={{true}}>
  <Woven::Button @variant="secondary" @icon="chat-circle" @shape="square" aria-label="Chats" />
</Woven::Badge>`,
  };

  argRows = [
    { name: '@variant', type: '"primary" | "secondary" | "success" | "warning" | "danger" | "info"', default: '', description: 'Colour scale. Unknown values render the neutral badge.' },
    { name: '@value', type: 'string | number', default: '', description: 'Displayed content. 0 still displays; only null or undefined hides the badge.' },
    { name: '@text', type: 'string', default: '', description: 'Alias of @value for label-style badges. @value wins when both are given.' },
    { name: '@max', type: 'number', default: '', description: 'Numeric cap; a larger @value renders as "{max}+".' },
    { name: '@size', type: '"sm" | "lg"', default: '', description: 'Size step for the pill form.' },
    { name: '@solid', type: 'boolean', default: 'false', description: 'Filled background with inverted text.' },
    { name: '@outline', type: 'boolean', default: 'false', description: 'Transparent background with a coloured border.' },
    { name: '@pill', type: 'boolean', default: 'false', description: 'Fully rounded ends.' },
    { name: '@quiet', type: 'boolean', default: 'false', description: 'Lower-contrast surface.' },
    { name: '@isDot', type: 'boolean', default: 'false', description: 'Renders a dot with no value; never hidden for lacking one.' },
    { name: '@count', type: 'boolean', default: 'false', description: 'Standalone count bubble (wu-badge-count) with no anchor element.' },
    { name: '@hidden', type: 'boolean', default: 'false', description: 'Hides the bubble while keeping the wrapped content.' },
  ];

  blockRows = [
    { name: 'default', description: 'Content to anchor the bubble to. When present the badge becomes a fixed corner bubble (wu-badge-wrap + is-fixed) instead of an inline pill.' },
  ];
}
