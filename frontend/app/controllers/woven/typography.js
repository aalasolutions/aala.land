import Controller from '@ember/controller';

const TITLE_SIZE_NOTES = {
  sm: 'Kit sm (lg font size). Card, panel and section titles. xs, md and lg render the same.',
  xl: 'No kit modifier (xl font size). Page titles in a detail view.',
  '2xl': 'Kit lg (2xl font size). Dashboard headings. Also the look when @size is omitted.',
  '3xl': 'Kit xl (3xl font size). A hero heading.',
};

const TEXT_SIZE_NOTES = {
  xs: 'Core text-xs utility. Fine print and dense metadata.',
  sm: 'Kit sm. Table cells, hints and secondary copy.',
  md: 'No modifier: body text, the default.',
  lg: 'Kit lg. Lead paragraphs.',
  xl: 'Core text-xl utility. A short emphasized statement.',
};

const TEXT_VARIANT_NOTES = {
  brand: 'Core text-brand. A brand-colored value or highlight.',
  secondary: 'Core text-gray, as on Tag.',
  success: 'Core text-success. A confirmed or positive result.',
  warning: 'Core text-warning. Something that needs a look.',
  danger: 'Core text-danger. An inline error, such as a failed upload.',
  info: 'Core text-info. Neutral guidance.',
};

const WEIGHT_NOTES = {
  normal: 'Body weight.',
  medium: 'A little emphasis for labels.',
  semibold: 'Headings inside body text.',
  bold: 'Strong emphasis, sparingly.',
};

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default class WovenTypographyController extends Controller {
  titleSizeExamples = Object.keys(TITLE_SIZE_NOTES).map((size) => ({
    size,
    title: `size ${size}`,
    note: TITLE_SIZE_NOTES[size],
    code: `<Woven::Title @tag="h3" @size="${size}" @text="Title ${size}" />`,
  }));

  textSizeExamples = Object.keys(TEXT_SIZE_NOTES).map((size) => ({
    size: size === 'md' ? undefined : size,
    label: `Text ${size}`,
    title: `size ${size}`,
    note: TEXT_SIZE_NOTES[size],
    code:
      size === 'md'
        ? '<Woven::Text @text="Text md" />'
        : `<Woven::Text @size="${size}" @text="Text ${size}" />`,
  }));

  textVariantExamples = Object.keys(TEXT_VARIANT_NOTES).map((variant) => ({
    variant,
    title: capitalize(variant),
    note: TEXT_VARIANT_NOTES[variant],
    code: `<Woven::Text @variant="${variant}" @text="${capitalize(variant)} text" />`,
  }));

  weightExamples = Object.keys(WEIGHT_NOTES).map((weight) => ({
    weight,
    title: capitalize(weight),
    note: WEIGHT_NOTES[weight],
    code: `<Woven::Text @weight="${weight}" @text="${capitalize(weight)} text" />`,
  }));

  code = {
    tag: `<Woven::Title @tag="h1" @size="xl" @text="An h1 at the xl size" />
<Woven::Title @tag="h4" @size="xl" @text="An h4 at the same size" />`,
    titleWeight: `<Woven::Title @size="xl" @weight="semibold" @text="Marina Tower" />`,
    titleTruncate: `<Woven::Title @size="sm" @tag="h4" @truncate={{true}} @text="A very long unit description that should truncate with an ellipsis when the container is narrow" />`,
    titleBlock: `<Woven::Title @size="sm" @tag="h5"><Woven::Icon @icon="buildings" /> Block content</Woven::Title>`,
    textTag: `<Woven::Text @tag="span" @size="xs" @text="Inline span" />`,
    muted: `<Woven::Text @muted={{true}} @text="Last synced 4 minutes ago." />`,
    subtle: `<Woven::Text @subtle={{true}} @text="Optional note." />`,
    truncate: `<Woven::Text @truncate={{true}} @text="Truncated to one line with an ellipsis when the container is narrower than this sentence." />`,
    clamp2: `<Woven::Text @clamp="2" @text="..." />`,
    clamp3: `<Woven::Text @clamp="3" @text="..." />`,
  };

  longText =
    'This unit includes a fully equipped kitchen, two parking bays, access to the marina promenade, and a maintenance package covering AC servicing twice a year plus emergency plumbing support around the clock, with a dedicated concierge desk in the lobby.';

  titleArgRows = [
    { name: '@tag', type: '"h1" | "h2" | "h3" | "h4" | "h5" | "h6"', default: '"h2"', description: 'Heading element. Pick the level from the document outline, the size from @size.' },
    { name: '@size', type: '"xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl"', default: '', description: 'Kit wu-title size by rendered font size: xs, sm, md and lg render kit sm; xl the kit default; 2xl kit lg; 3xl kit xl. Omitted or unknown renders kit lg.' },
    { name: '@weight', type: '"normal" | "medium" | "semibold" | "bold"', default: '', description: 'Core font-{weight} utility.' },
    { name: '@truncate', type: 'boolean', default: 'false', description: 'Core truncate utility: single line with an ellipsis.' },
    { name: '@text', type: 'string', default: '', description: 'Content when no block is given.' },
  ];

  textArgRows = [
    { name: '@tag', type: '"p" | "span"', default: '"p"', description: 'Block paragraph or inline span.' },
    { name: '@size', type: '"xs" | "sm" | "md" | "lg" | "xl"', default: '"md"', description: 'Kit wu-text sm or lg; xs and xl add the core text-xs and text-xl utilities; md is the kit default body size.' },
    { name: '@variant', type: '"brand" | "secondary" | "success" | "warning" | "danger" | "info"', default: '', description: 'Core role text color utility: text-brand, text-success, text-warning, text-danger, text-info; secondary adds text-gray. Unknown values add nothing.' },
    { name: '@weight', type: '"normal" | "medium" | "semibold" | "bold"', default: '', description: 'Core font-{weight} utility.' },
    { name: '@muted', type: 'boolean', default: 'false', description: 'Kit muted modifier.' },
    { name: '@subtle', type: 'boolean', default: 'false', description: 'Core text-subtle utility, lighter than muted.' },
    { name: '@truncate', type: 'boolean', default: 'false', description: 'Core truncate utility: single line with an ellipsis.' },
    { name: '@clamp', type: '"2" | "3"', default: '', description: 'Core truncate-2 or truncate-3 utility: clamp to two or three lines.' },
    { name: '@text', type: 'string', default: '', description: 'Content when no block is given.' },
  ];

  blockRows = [
    { name: 'default', description: 'Content. Takes precedence over @text on both components.' },
  ];
}
