import Controller from '@ember/controller';

const SIZE_NOTES = {
  xs: 'Inline with small text: activity feeds, comment bylines.',
  sm: 'Table cells and list rows.',
  md: 'The default for cards and headers.',
  lg: 'Profile panels and detail headers.',
  xl: 'A profile page hero.',
};

const STATUS_NOTES = {
  success: 'Online or available.',
  warning: 'Away or idle.',
  danger: 'Busy or offline.',
  secondary: 'Unknown or inactive.',
  primary: 'Highlighted, for the current user.',
  info: 'Informational, such as an external account.',
};

export default class WovenAvatarController extends Controller {
  sizeExamples = Object.keys(SIZE_NOTES).map((size) => ({
    size,
    title: size.toUpperCase(),
    note: SIZE_NOTES[size],
    code: `<Woven::Avatar @initials="${size.toUpperCase()}" @size="${size}" />`,
  }));

  statusExamples = Object.keys(STATUS_NOTES).map((status) => ({
    status,
    title: status.charAt(0).toUpperCase() + status.slice(1),
    note: STATUS_NOTES[status],
    code: `<Woven::Avatar @initials="AM" @status="${status}" />`,
  }));

  code = {
    image: `<Woven::Avatar @src="https://i.pravatar.cc/100?img=12" @alt="User avatar" />`,
    initials: `<Woven::Avatar @initials="AM" />`,
    icon: `<Woven::Avatar @icon="👤" />`,
    square: `<Woven::Avatar @initials="SQ" @square={{true}} />`,
    group: `<Woven::AvatarGroup>
  <Woven::Avatar @initials="AM" />
  <Woven::Avatar @initials="SQ" />
  <Woven::Avatar @initials="ON" />
  <Woven::Avatar @src="https://i.pravatar.cc/100?img=12" @alt="User avatar" />
</Woven::AvatarGroup>`,
    groupCompact: `<Woven::AvatarGroup @compact={{true}}>
  <Woven::Avatar @initials="AM" @size="sm" />
  <Woven::Avatar @initials="SQ" @size="sm" />
  <Woven::Avatar @initials="ON" @size="sm" />
</Woven::AvatarGroup>`,
  };

  argRows = [
    { name: '@src', type: 'string', default: '', description: 'Image URL. When set, initials and icon are ignored.' },
    { name: '@alt', type: 'string', default: '', description: 'Alt text for the image.' },
    { name: '@initials', type: 'string', default: '', description: 'Text fallback when there is no image.' },
    { name: '@icon', type: 'string', default: '', description: 'Glyph fallback when there is neither image nor initials.' },
    { name: '@size', type: '"xs" | "sm" | "md" | "lg" | "xl"', default: '', description: 'Diameter step.' },
    { name: '@square', type: 'boolean', default: 'false', description: 'Rounded square instead of a circle.' },
    { name: '@status', type: '"primary" | "secondary" | "success" | "warning" | "danger" | "info"', default: '', description: 'Renders a status dot on the avatar in the given colour.' },
  ];

  groupArgRows = [
    { name: '@compact', type: 'boolean', default: 'false', description: 'Tighter overlap between stacked avatars.' },
  ];
}
