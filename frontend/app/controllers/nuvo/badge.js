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

export default class NuvoBadgeController extends Controller {
  variantExamples = Object.keys(VARIANT_NOTES).map((variant) => ({
    variant: variant === 'default' ? undefined : variant,
    title: capitalize(variant),
    note: VARIANT_NOTES[variant],
    code:
      variant === 'default'
        ? '<Nuvo::Badge @value="Default" />'
        : `<Nuvo::Badge @variant="${variant}" @value="${capitalize(variant)}" />`,
  }));

  code = {
    solid: `<Nuvo::Badge @variant="primary" @solid={{true}} @value="Solid" />`,
    outline: `<Nuvo::Badge @variant="success" @outline={{true}} @value="Outline" />`,
    pill: `<Nuvo::Badge @variant="info" @pill={{true}} @value="Pill" />`,
    quiet: `<Nuvo::Badge @variant="warning" @quiet={{true}} @value="Quiet" />`,
    sm: `<Nuvo::Badge @variant="danger" @size="sm" @value="Small" />`,
    lg: `<Nuvo::Badge @variant="danger" @size="lg" @value="Large" />`,
    zero: `<Nuvo::Badge @variant="warning" @value={{0}} />`,
    dot: `<Nuvo::Badge @variant="secondary" @isDot={{true}} />`,
    text: `<Nuvo::Badge @variant="success" @text="Active" />`,
    count: `<Nuvo::Badge @count={{true}} @value={{3}} />
<Nuvo::Badge @count={{true}} @variant="primary" @value={{12}} />
<Nuvo::Badge @count={{true}} @variant="success" @value={{99}} />`,
    countMax: `<Nuvo::Badge @count={{true}} @variant="info" @value={{250}} @max={{99}} />`,
    countDot: `<Nuvo::Badge @count={{true}} @variant="danger" @isDot={{true}} />`,
    max: `<Nuvo::Badge @variant="danger" @value={{120}} @max={{99}} />`,
    wrapped: `<Nuvo::Badge @variant="danger" @value={{5}}>
  <Nuvo::Button @variant="secondary" @icon="envelope" @shape="square" aria-label="Messages" />
</Nuvo::Badge>`,
    wrappedDot: `<Nuvo::Badge @variant="success" @isDot={{true}}>
  <Nuvo::Button @variant="secondary" @icon="bell" @shape="square" aria-label="Notifications" />
</Nuvo::Badge>`,
    wrappedZero: `<Nuvo::Badge @variant="primary" @value={{0}}>
  <Nuvo::Button @variant="secondary" @icon="star" @shape="square" aria-label="Favourites" />
</Nuvo::Badge>`,
    hidden: `<Nuvo::Badge @variant="danger" @value={{7}} @hidden={{true}}>
  <Nuvo::Button @variant="secondary" @icon="chat-circle" @shape="square" aria-label="Chats" />
</Nuvo::Badge>`,
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
    { name: '@count', type: 'boolean', default: 'false', description: 'Standalone count bubble (nu-badge-count) with no anchor element.' },
    { name: '@hidden', type: 'boolean', default: 'false', description: 'Hides the bubble while keeping the wrapped content.' },
  ];

  blockRows = [
    { name: 'default', description: 'Content to anchor the bubble to. When present the badge becomes a fixed corner bubble (nu-badge-wrap + is-fixed) instead of an inline pill.' },
  ];
}
