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

export default class NuvoAvatarController extends Controller {
  sizeExamples = Object.keys(SIZE_NOTES).map((size) => ({
    size,
    title: size.toUpperCase(),
    note: SIZE_NOTES[size],
    code: `<Nuvo::Avatar @initials="${size.toUpperCase()}" @size="${size}" />`,
  }));

  statusExamples = Object.keys(STATUS_NOTES).map((status) => ({
    status,
    title: status.charAt(0).toUpperCase() + status.slice(1),
    note: STATUS_NOTES[status],
    code: `<Nuvo::Avatar @initials="AM" @status="${status}" />`,
  }));

  code = {
    image: `<Nuvo::Avatar @src="https://i.pravatar.cc/100?img=12" @alt="User avatar" />`,
    initials: `<Nuvo::Avatar @initials="AM" />`,
    icon: `<Nuvo::Avatar @icon="👤" />`,
    square: `<Nuvo::Avatar @initials="SQ" @square={{true}} />`,
    group: `<Nuvo::AvatarGroup>
  <Nuvo::Avatar @initials="AM" />
  <Nuvo::Avatar @initials="SQ" />
  <Nuvo::Avatar @initials="ON" />
  <Nuvo::Avatar @src="https://i.pravatar.cc/100?img=12" @alt="User avatar" />
</Nuvo::AvatarGroup>`,
    groupCompact: `<Nuvo::AvatarGroup @compact={{true}}>
  <Nuvo::Avatar @initials="AM" @size="sm" />
  <Nuvo::Avatar @initials="SQ" @size="sm" />
  <Nuvo::Avatar @initials="ON" @size="sm" />
</Nuvo::AvatarGroup>`,
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
