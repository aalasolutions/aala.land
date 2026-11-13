import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { click, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | woven/CSS kit display classes', function (hooks) {
  setupRenderingTest(hooks);

  test('card renders kit parts and drops modifiers without a kit equivalent', async function (assert) {
    await render(hbs`
      <Woven::Card @title="Lease" @subtitle="Unit 4" @compact={{true}} @interactive={{true}} @selected={{true}} @accent="brand">
        <:body>Body</:body>
        <:footer>Footer</:footer>
      </Woven::Card>
    `);
    assert.dom('[data-test-wu-card]').hasAttribute('class', 'wu-card');
    assert.dom('[data-test-wu-card-header]').hasClass('wu-card-header');
    assert.dom('[data-test-wu-card-title]').hasClass('wu-card-title');
    assert.dom('[data-test-wu-card-subtitle]').hasText('Unit 4');
    assert.dom('[data-test-wu-card-footer]').hasClass('wu-card-footer');

    await render(hbs`<Woven::Card>Body only</Woven::Card>`);
    assert.dom('[data-test-wu-card-body]').hasClass('wu-card-body');
    assert.dom('[data-test-wu-card-header]').doesNotExist();
  });

  test('panel renders kit parts', async function (assert) {
    await render(hbs`<Woven::Panel @title="Billing" @compact={{true}} @raised={{true}}>Body</Woven::Panel>`);
    assert.dom('[data-test-wu-panel]').hasAttribute('class', 'wu-panel');
    assert.dom('[data-test-wu-panel-header]').hasClass('wu-panel-header');
    assert.dom('[data-test-wu-panel-title]').hasClass('wu-panel-title');
    assert.dom('[data-test-wu-panel-body]').hasClass('wu-panel-body');
  });

  test('alert maps roles, renders kit parts and keeps the close callback', async function (assert) {
    let closed = 0;
    this.set('onClose', () => closed++);
    await render(hbs`
      <Woven::Alert @variant="danger" @title="Failed" @description="Try again." @icon="!" @inline={{true}} @closable={{true}} @onClose={{this.onClose}}>
        <:actions><button type="button">Retry</button></:actions>
      </Woven::Alert>
    `);
    assert.dom('[data-test-wu-alert]').hasAttribute('class', 'wu-alert danger');
    assert.dom('[data-test-wu-alert-title]').hasClass('wu-alert-title');
    assert.dom('[data-test-wu-alert-description]').hasText('Try again.');
    assert.dom('[data-test-wu-alert-actions]').hasClass('wu-alert-actions');
    assert.dom('[data-test-wu-alert-icon]').doesNotExist();
    assert.dom('[data-test-wu-alert] > :last-child').hasClass('wu-alert-close');
    await click('[data-test-wu-alert-close]');
    assert.strictEqual(closed, 1);

    await render(hbs`<Woven::Alert @variant="secondary" @title="Note" />`);
    assert.dom('[data-test-wu-alert]').hasAttribute('class', 'wu-alert');
  });

  test('empty state maps sm and bordered, drops lg and fill', async function (assert) {
    await render(hbs`<Woven::EmptyState @size="sm" @bordered={{true}} @icon="?" @title="None" @description="Nothing here." />`);
    assert.dom('[data-test-wu-empty-state]').hasAttribute('class', 'wu-empty-state sm dashed');
    assert.dom('[data-test-wu-empty-state-icon]').hasClass('wu-empty-state-icon');
    assert.dom('[data-test-wu-empty-state-title]').hasClass('wu-empty-state-title');
    assert.dom('[data-test-wu-empty-state-description]').hasClass('wu-empty-state-text');

    await render(hbs`<Woven::EmptyState @size="lg" @fill={{true}} @title="None" />`);
    assert.dom('[data-test-wu-empty-state]').hasAttribute('class', 'wu-empty-state');
  });

  test('skeleton maps shapes and sets width through the kit variable', async function (assert) {
    await render(hbs`<Woven::Skeleton @shape="title" @width="50" />`);
    assert.dom('[data-test-wu-skeleton]').hasAttribute('class', 'wu-skeleton text animated');
    assert.dom('[data-test-wu-skeleton]').hasAttribute('style', '--wu-skeleton--Width: 50%');
    assert.dom('[data-test-wu-skeleton]').hasAttribute('aria-hidden', 'true');

    await render(hbs`<Woven::Skeleton @shape="circle" />`);
    assert.dom('[data-test-wu-skeleton]').hasAttribute('class', 'wu-skeleton circle animated');

    await render(hbs`<Woven::Skeleton @lines={{3}} />`);
    assert.dom('[data-test-wu-skeleton-group] .wu-skeleton.text').exists({ count: 3 });
  });

  test('progress renders a native progress with roles, sizes and a label part', async function (assert) {
    await render(hbs`<Woven::Progress @value={{40}} @variant="success" @size="xl" @showText={{true}} @striped={{true}} />`);
    assert.dom('[data-test-wu-progress]').hasTagName('progress');
    assert.dom('[data-test-wu-progress]').hasAttribute('class', 'wu-progress success lg');
    assert.dom('[data-test-wu-progress]').hasProperty('value', 40);
    assert.dom('[data-test-wu-progress-label]').hasClass('wu-progress-label');
    assert.dom('[data-test-wu-progress-label]').hasText('40%');

    await render(hbs`<Woven::Progress @indeterminate={{true}} @variant="brand" aria-label="Loading" />`);
    assert.dom('[data-test-wu-progress]').hasAttribute('class', 'wu-progress');
    assert.dom('[data-test-wu-progress]').doesNotHaveAttribute('value');
    assert.dom('[data-test-wu-progress]').hasAttribute('aria-label', 'Loading');
  });

  test('progress circle sets the kit value variable', async function (assert) {
    await render(hbs`<Woven::ProgressCircle @value={{72}} @variant="warning" @size="sm" @showText={{true}} />`);
    assert.dom('[data-test-wu-progress-circle]').hasAttribute('class', 'wu-progress-circle warning sm');
    assert.dom('[data-test-wu-progress-circle]').hasAttribute('style', '--wu-progress-circle--Value: 72');
    assert.dom('[data-test-wu-progress-circle-label]').hasClass('wu-progress-circle-label');
  });

  test('stat renders kit parts and moves success and danger to the change line', async function (assert) {
    await render(hbs`<Woven::Stat @variant="danger" @size="lg" @label="Spent" @value="10" @delta="+2" />`);
    assert.dom('[data-test-wu-stat]').hasAttribute('class', 'wu-stat lg');
    assert.dom('[data-test-wu-stat-label]').hasClass('wu-stat-label');
    assert.dom('[data-test-wu-stat-value]').hasClass('wu-stat-value');
    assert.dom('[data-test-wu-stat-delta]').hasAttribute('class', 'wu-stat-delta danger');

    await render(hbs`<Woven::Stat @variant="warning" @row={{true}} @label="Cheques" @value="3" @delta="Due" />`);
    assert.dom('[data-test-wu-stat]').hasAttribute('class', 'wu-stat');
    assert.dom('[data-test-wu-stat-delta]').hasAttribute('class', 'wu-stat-delta');
  });

  test('divider is an hr when bare and a div with its label otherwise', async function (assert) {
    await render(hbs`<Woven::Divider @vertical={{true}} @dashed={{true}} />`);
    assert.dom('[data-test-wu-divider]').hasTagName('hr');
    assert.dom('[data-test-wu-divider]').hasAttribute('class', 'wu-divider dashed');
    assert.dom('[data-test-wu-divider]').hasAttribute('aria-orientation', 'vertical');

    await render(hbs`<Woven::Divider @label="OR" @labelPosition="start" />`);
    assert.dom('[data-test-wu-divider]').hasTagName('div');
    assert.dom('[data-test-wu-divider]').hasAttribute('class', 'wu-divider');
    assert.dom('[data-test-wu-divider-label]').hasText('OR');
  });

  test('text and title map sizes to kit modifiers and extras to core utilities', async function (assert) {
    await render(hbs`<Woven::Text @size="sm" @muted={{true}} @weight="semibold" @truncate={{true}} @text="Hi" />`);
    assert.dom('[data-test-wu-text]').hasAttribute('class', 'wu-text sm muted font-semibold truncate');

    await render(hbs`<Woven::Title @text="Page" />`);
    assert.dom('[data-test-wu-title]').hasAttribute('class', 'wu-title lg');

    await render(hbs`<Woven::Title @size="xl" @text="Page" />`);
    assert.dom('[data-test-wu-title]').hasAttribute('class', 'wu-title');

    await render(hbs`<Woven::Title @size="3xl" @tag="h1" @text="Page" />`);
    assert.dom('[data-test-wu-title]').hasAttribute('class', 'wu-title xl');
  });

  test('text maps every size to a kit modifier or a core font-size utility', async function (assert) {
    const expected = { xs: 'wu-text text-xs', sm: 'wu-text sm', md: 'wu-text', lg: 'wu-text lg', xl: 'wu-text text-xl' };

    for (const [size, classes] of Object.entries(expected)) {
      this.set('size', size);
      await render(hbs`<Woven::Text @size={{this.size}} @text="Hi" />`);
      assert.dom('[data-test-wu-text]').hasAttribute('class', classes, `size ${size}`);
    }
  });

  test('text maps every variant to a core role text color', async function (assert) {
    const expected = {
      brand: 'text-brand',
      secondary: 'text-gray',
      success: 'text-success',
      warning: 'text-warning',
      danger: 'text-danger',
      info: 'text-info',
    };

    for (const [variant, utility] of Object.entries(expected)) {
      this.set('variant', variant);
      await render(hbs`<Woven::Text @variant={{this.variant}} @text="Hi" />`);
      assert.dom('[data-test-wu-text]').hasAttribute('class', `wu-text ${utility}`, `variant ${variant}`);
    }

    await render(hbs`<Woven::Text @variant="unknown" @text="Hi" />`);
    assert.dom('[data-test-wu-text]').hasAttribute('class', 'wu-text');
  });

  test('text maps subtle, weights, clamp and tag', async function (assert) {
    await render(hbs`<Woven::Text @size="xs" @variant="danger" @tag="span" @text="Hi" />`);
    assert.dom('[data-test-wu-text]').hasTagName('span');
    assert.dom('[data-test-wu-text]').hasAttribute('class', 'wu-text text-xs text-danger');

    await render(hbs`<Woven::Text @subtle={{true}} @weight="bold" @clamp="2" @text="Hi" />`);
    assert.dom('[data-test-wu-text]').hasTagName('p');
    assert.dom('[data-test-wu-text]').hasAttribute('class', 'wu-text text-subtle font-bold truncate-2');
  });

  test('info row and description list render kit parts', async function (assert) {
    await render(hbs`<Woven::InfoRow @label="Rent" @value="AED 1" />`);
    assert.dom('[data-test-wu-info-row-label]').hasClass('wu-info-row-label');
    assert.dom('[data-test-wu-info-row-value]').hasClass('wu-info-row-value');

    this.set('items', [{ term: 'Tenant', description: 'Test User' }]);
    await render(hbs`<Woven::DescList @items={{this.items}} @horizontal={{true}} @compact={{true}} />`);
    assert.dom('[data-test-wu-desc-list]').hasAttribute('class', 'wu-desc-list horizontal');
    assert.dom('[data-test-wu-desc-list-group]').doesNotHaveAttribute('class');
    assert.dom('[data-test-wu-desc-list-term]').hasText('Tenant');
  });

  test('list and list item render kit parts', async function (assert) {
    this.set('items', ['One', 'Two']);
    await render(hbs`<Woven::List @items={{this.items}} @compact={{true}} @bordered={{true}} />`);
    assert.dom('[data-test-wu-list]').hasAttribute('class', 'wu-list sm');
    assert.dom('[data-test-wu-list-item]').exists({ count: 2 });
    assert.dom('[data-test-wu-list-item] .wu-list-body .wu-list-title').exists({ count: 2 });

    await render(hbs`<Woven::ListItem><:main>Main</:main><:actions>Act</:actions></Woven::ListItem>`);
    assert.dom('[data-test-wu-list-item]').hasAttribute('class', 'wu-list-item');
    assert.dom('[data-test-wu-list-item-main]').hasText('Main');
    assert.dom('[data-test-wu-list-item-actions]').hasText('Act');
  });

  test('timeline items take roles and mark the active step', async function (assert) {
    await render(hbs`
      <Woven::Timeline @compact={{true}}>
        <Woven::TimelineItem @variant="success" @title="Created" @timestamp="09:14" @description="Lead added" />
        <Woven::TimelineItem @active={{true}} @title="Contacted" />
      </Woven::Timeline>
    `);
    assert.dom('[data-test-wu-timeline]').hasAttribute('class', 'wu-timeline');
    assert.dom('[data-test-wu-timeline-item]').hasAttribute('class', 'wu-timeline-item success');
    assert.dom('[data-test-wu-timeline-title]').hasClass('wu-timeline-title');
    assert.dom('[data-test-wu-timeline-timestamp]').hasClass('wu-timeline-time');
    assert.dom('[data-test-wu-timeline-description]').hasClass('wu-timeline-text');
    assert.dom('[data-test-wu-timeline-item]:last-child').hasAttribute('aria-current', 'step');
    assert.dom('[data-test-wu-timeline-item]:first-child').doesNotHaveAttribute('aria-current');
  });
});
