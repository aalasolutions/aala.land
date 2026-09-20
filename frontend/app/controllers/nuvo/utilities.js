import Controller from '@ember/controller';

const SPACING = [
  ['0', '0', '0'],
  ['1', '0.25rem', '4px'],
  ['2', '0.5rem', '8px'],
  ['3', '0.75rem', '12px'],
  ['4', '1rem', '16px'],
  ['5', '1.25rem', '20px'],
  ['6', '1.5rem', '24px'],
  ['8', '2rem', '32px'],
  ['10', '2.5rem', '40px'],
  ['12', '3rem', '48px'],
  ['16', '4rem', '64px'],
  ['20', '5rem', '80px'],
  ['24', '6rem', '96px'],
  ['32', '8rem', '128px'],
  ['40', '10rem', '160px'],
  ['48', '12rem', '192px'],
  ['56', '14rem', '224px'],
  ['64', '16rem', '256px'],
];

export default class NuvoUtilitiesController extends Controller {
  code = {
    start: `<Nuvo::Panel class="text-start">text-start</Nuvo::Panel>`,
    end: `<Nuvo::Panel class="text-end">text-end</Nuvo::Panel>`,
    center: `<Nuvo::Panel class="text-center">text-center (core)</Nuvo::Panel>`,
    ms: `<Nuvo::Panel class="ms-8">ms-8</Nuvo::Panel>`,
    me: `<Nuvo::Panel class="me-8">me-8</Nuvo::Panel>`,
    ps: `<Nuvo::Panel class="ps-8">ps-8</Nuvo::Panel>`,
    pe: `<Nuvo::Panel class="pe-8">pe-8</Nuvo::Panel>`,
    flipGlyph: `<span class="flip-rtl">▸</span>`,
    flipIcon: `<Nuvo::Icon @icon="arrow-right" />`,
  };

  classRows = [
    { name: 'text-start', description: 'text-align: start. Core ships only physical text-left and text-right.' },
    { name: 'text-end', description: 'text-align: end.' },
    { name: 'ms-{n} / me-{n}', description: 'margin-inline-start / margin-inline-end on the spacing scale.' },
    { name: 'ps-{n} / pe-{n}', description: 'padding-inline-start / padding-inline-end on the spacing scale.' },
    { name: 'flip-rtl', description: 'Mirrors the element with scaleX(-1) under dir="rtl". Nuvo::Icon adds it to icons named left or right.' },
  ];

  spacingRows = SPACING.map(([key, rem, px]) => ({
    name: key,
    signature: rem,
    description: px,
  }));
}
