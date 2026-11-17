import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { click, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module(
  'Integration | Component | woven/navigation kit classes',
  function (hooks) {
    setupRenderingTest(hooks);

    test('page header renders kit parts, maps bordered to divided and puts the breadcrumb first', async function (assert) {
      this.items = [{ label: 'Properties', href: '/properties' }];
      await render(hbs`
      <Woven::PageHeader @title="Marina" @subtitle="42 units" @bordered={{true}}>
        <:breadcrumb>
          <Woven::Breadcrumb @items={{this.items}} @compact={{true}} @parentsOnly={{true}} />
        </:breadcrumb>
        <:actions><button type="button">Add</button></:actions>
      </Woven::PageHeader>
    `);

      assert
        .dom('[data-test-wu-page-header]')
        .hasAttribute('class', 'wu-page-header divided');
      assert
        .dom('[data-test-wu-page-header] > .wu-breadcrumb')
        .exists('breadcrumb is a direct child');
      assert
        .dom('.wu-page-header-main > h1.wu-page-header-title')
        .hasText('Marina');
      assert
        .dom('.wu-page-header-main > p.wu-page-header-text')
        .hasText('42 units');
      assert
        .dom('[data-test-wu-page-header-actions]')
        .hasClass('wu-page-header-actions');
    });

    test('page header meta sits beside the title, and a crumb-only header has no main column', async function (assert) {
      await render(hbs`
      <Woven::PageHeader @title="Contacts"><:meta><span>38 contacts</span></:meta></Woven::PageHeader>
    `);
      assert.dom('[data-test-wu-page-header-meta]').hasText('38 contacts');
      assert
        .dom(
          '[data-test-wu-page-header-title] + [data-test-wu-page-header-meta]',
        )
        .exists('meta follows the title on its row');

      this.items = [{ label: 'Properties', href: '/properties' }];
      await render(hbs`
      <Woven::PageHeader>
        <:breadcrumb><Woven::Breadcrumb @items={{this.items}} @parentsOnly={{true}} /></:breadcrumb>
      </Woven::PageHeader>
    `);
      assert.dom('.wu-page-header-main').doesNotExist();
    });

    test('breadcrumb renders kit parts and maps compact and slash', async function (assert) {
      this.items = [
        { label: 'Properties', href: '/properties' },
        { label: 'Marina' },
      ];
      await render(
        hbs`<Woven::Breadcrumb @items={{this.items}} @compact={{true}} @separator="slash" />`,
      );

      assert
        .dom('[data-test-wu-breadcrumb]')
        .hasAttribute('class', 'wu-breadcrumb slash sm');
      assert
        .dom('ol.wu-breadcrumb-list > li.wu-breadcrumb-item')
        .exists({ count: 2 });
      assert.dom('a.wu-breadcrumb-link').hasText('Properties');
      assert.dom('.wu-breadcrumb-item [aria-current="page"]').hasText('Marina');
    });

    test('toolbar maps bordered to boxed and size sm', async function (assert) {
      await render(hbs`<Woven::Toolbar @bordered={{true}} @size="sm" />`);
      assert
        .dom('[data-test-wu-toolbar]')
        .hasAttribute('class', 'wu-toolbar boxed sm');
    });

    test('sidebar is a labelled kit nav with header, footer and modifiers', async function (assert) {
      await render(hbs`
      <Woven::Sidebar @collapsed={{true}} @pinned={{true}} @brandTitle="Kit">
        <:default><ul class="wu-sidebar-list"></ul></:default>
        <:footer>v1</:footer>
      </Woven::Sidebar>
    `);

      assert
        .dom('nav[data-test-wu-sidebar]')
        .hasAttribute('class', 'wu-sidebar collapsed pinned');
      assert.dom('[data-test-wu-sidebar]').hasAttribute('aria-label', 'Main');
      assert.dom('.wu-sidebar-header').includesText('Kit');
      assert.dom('.wu-sidebar-footer').hasText('v1');
      assert.dom('[data-test-wu-sidebar-backdrop]').doesNotExist();
    });

    test('a dismissible sidebar is off-canvas with a backdrop that reports dismiss', async function (assert) {
      this.open = false;
      this.dismissed = 0;
      this.onDismiss = () => (this.dismissed += 1);
      await render(hbs`
      <Woven::Sidebar @dismissible={{true}} @open={{this.open}} @onDismiss={{this.onDismiss}} />
    `);

      assert
        .dom('[data-test-wu-sidebar]')
        .hasAttribute('data-wu-offcanvas', 'true');
      assert.dom('[data-test-wu-sidebar]').doesNotHaveAttribute('data-wu-open');
      assert.dom('[data-test-wu-sidebar-backdrop]').hasAttribute('hidden');

      this.set('open', true);
      assert.dom('[data-test-wu-sidebar]').hasAttribute('data-wu-open', 'true');
      assert
        .dom('[data-test-wu-sidebar-backdrop]')
        .doesNotHaveAttribute('hidden');
      await click('[data-test-wu-sidebar-backdrop]');
      assert.strictEqual(this.dismissed, 1);
    });

    test('sidebar link marks the active row with aria-current', async function (assert) {
      await render(hbs`<Woven::SidebarLink @label="Units" @active={{true}} />`);
      assert
        .dom('[data-test-wu-sidebar-link]')
        .hasAttribute('class', 'wu-sidebar-link');
      assert
        .dom('[data-test-wu-sidebar-link]')
        .hasAttribute('aria-current', 'page');
      assert
        .dom('[data-test-wu-sidebar-link] .wu-sidebar-label')
        .hasText('Units');
    });

    test('topbar renders kit parts and maps sticky to pinned', async function (assert) {
      this.toggled = 0;
      this.onToggle = () => (this.toggled += 1);
      await render(hbs`
      <Woven::Topbar @sticky={{true}} @brand="Acme" @userName="Test User" @onToggle={{this.onToggle}}>
        <:actions><button type="button">Act</button></:actions>
      </Woven::Topbar>
    `);

      assert
        .dom('[data-test-wu-topbar]')
        .hasAttribute('class', 'wu-topbar pinned');
      assert.dom('.wu-topbar-brand').hasText('Acme');
      assert.dom('.wu-topbar-end').includesText('Act');
      assert.dom('.wu-topbar-end').includesText('Test User');
      await click('[data-test-wu-topbar-toggle]');
      assert.strictEqual(this.toggled, 1);
    });
  },
);
