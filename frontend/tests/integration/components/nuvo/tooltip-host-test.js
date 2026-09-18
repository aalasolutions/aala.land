import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import {
  render,
  settled,
  triggerEvent,
  triggerKeyEvent,
} from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

const LONG_HINT =
  'Three letter code such as AED or USD. It must match the currency the money actually arrived in.';

function placeTrigger(css, hint = LONG_HINT, placement) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '?';
  button.dataset.tooltip = hint;
  button.dataset.testProbe = 'true';
  if (placement) button.dataset.tooltipPosition = placement;
  button.style.cssText = `position:fixed;z-index:9999;${css}`;
  document.body.append(button);
  return button;
}

async function showTooltipFor(button) {
  await triggerEvent(button, 'mouseover');

  return document.querySelector('.nu-tooltip');
}

module('Integration | Component | nuvo/tooltip-host', function (hooks) {
  setupRenderingTest(hooks);

  // The test container is scaled down by default, which would distort every
  // rectangle this suite measures.
  hooks.beforeEach(function () {
    this.container = document.getElementById('ember-testing');
    this.containerTransform = this.container.style.transform;
    this.containerWidth = this.container.style.width;
    this.container.style.transform = 'none';
    this.container.style.width = '100%';
  });

  hooks.afterEach(async function () {
    this.container.style.transform = this.containerTransform;
    this.container.style.width = this.containerWidth;
    document.querySelectorAll('[data-test-probe]').forEach((el) => el.remove());
    await settled();
  });

  test('a tooltip at the right edge is pulled back inside the window', async function (assert) {
    await render(hbs`<Nuvo::TooltipHost />`);

    const trigger = placeTrigger('top:200px;right:2px;');
    const tooltip = await showTooltipFor(trigger);
    assert.ok(tooltip, 'the tooltip is shown');

    const box = tooltip.getBoundingClientRect();
    assert.ok(box.right <= window.innerWidth, 'its right edge is on screen');
    assert.ok(box.left >= 0, 'and it did not overshoot the other way');

    const arrow = tooltip
      .querySelector('.nu-tooltip__arrow')
      .getBoundingClientRect();
    const triggerBox = trigger.getBoundingClientRect();
    assert.ok(
      Math.abs(
        arrow.left + arrow.width / 2 - (triggerBox.left + triggerBox.width / 2),
      ) <= 14,
      'the arrow still points at the trigger',
    );
  });

  test('a tooltip at the left edge is pushed back inside the window', async function (assert) {
    await render(hbs`<Nuvo::TooltipHost />`);

    const trigger = placeTrigger('top:200px;left:2px;');
    const tooltip = await showTooltipFor(trigger);

    const box = tooltip.getBoundingClientRect();
    assert.ok(box.left >= 0, 'its left edge is on screen');
    assert.ok(box.right <= window.innerWidth, 'and it fits on the right too');
  });

  test('a side-placed tooltip at the edge flips clear of its own trigger', async function (assert) {
    await render(hbs`<Nuvo::TooltipHost />`);

    const trigger = placeTrigger('top:240px;right:2px;', LONG_HINT, 'end');
    const tooltip = await showTooltipFor(trigger);
    const box = tooltip.getBoundingClientRect();
    const triggerBox = trigger.getBoundingClientRect();

    assert.dom(tooltip).hasClass('m-left', 'it flipped to the side with room');
    assert.ok(box.right <= triggerBox.left, 'and does not cover the trigger');
  });

  test('the trigger points at the tooltip, and Escape dismisses it', async function (assert) {
    await render(hbs`<Nuvo::TooltipHost />`);

    const trigger = placeTrigger('top:200px;left:200px;', 'Short hint');
    const tooltip = await showTooltipFor(trigger);

    assert.strictEqual(
      trigger.getAttribute('aria-describedby'),
      tooltip.id,
      'the trigger describes itself with the tooltip',
    );

    await triggerKeyEvent(document, 'keydown', 'Escape');

    assert.dom('.nu-tooltip').doesNotExist('Escape dismissed it');
    assert.strictEqual(
      trigger.getAttribute('aria-describedby'),
      null,
      'and the link was cleaned up',
    );
  });

  test('a tooltip the flip cannot rescue is lifted by the fit modifier', async function (assert) {
    await render(hbs`<Nuvo::TooltipHost />`);

    // Above the 64px flip threshold, but too close to the top for a tall hint.
    const trigger = placeTrigger('top:70px;left:40%;', LONG_HINT, 'top');
    const tooltip = await showTooltipFor(trigger);

    assert.dom(tooltip).hasClass('m-top', 'the placement did not flip');
    assert.notStrictEqual(
      tooltip.style.getPropertyValue('--nu-tooltip--ShiftY'),
      '0px',
      'the fit modifier supplied the correction',
    );
    assert.ok(tooltip.getBoundingClientRect().top >= 0, 'and it is on screen');
  });

  test('it shows on keyboard focus, not only on hover', async function (assert) {
    await render(hbs`<Nuvo::TooltipHost />`);

    const trigger = placeTrigger('top:200px;left:200px;', 'Short hint');
    await triggerEvent(trigger, 'focusin');

    assert.dom('.nu-tooltip').hasText('Short hint');
  });

  test('a tap outside any trigger dismisses it on touch', async function (assert) {
    await render(hbs`<Nuvo::TooltipHost />`);

    const trigger = placeTrigger('top:200px;left:200px;', 'Short hint');
    await showTooltipFor(trigger);
    assert.dom('.nu-tooltip').exists('shown');

    await triggerEvent(document.body, 'touchstart');
    assert.dom('.nu-tooltip').doesNotExist('a tap elsewhere hid it');
  });

  test('a shift from one tooltip does not carry over to the next', async function (assert) {
    await render(hbs`<Nuvo::TooltipHost />`);

    const atEdge = placeTrigger('top:200px;right:2px;');
    const shifted = await showTooltipFor(atEdge);
    assert.notStrictEqual(
      shifted.style.getPropertyValue('--nu-tooltip--ShiftX'),
      '0px',
      'the edge tooltip is shifted',
    );

    await triggerEvent(atEdge, 'mouseout');

    const middle = `top:${Math.round(window.innerHeight / 2)}px;left:${Math.round(
      window.innerWidth / 3,
    )}px;`;
    const roomy = placeTrigger(middle, 'Short');
    const tooltip = await showTooltipFor(roomy);

    const box = tooltip.getBoundingClientRect();
    assert.ok(
      box.left >= 0 && box.right <= window.innerWidth,
      'the next tooltip is inside the window',
    );
    assert.strictEqual(
      tooltip.style.getPropertyValue('--nu-tooltip--ShiftX'),
      '0px',
      'and carries no leftover shift',
    );
  });
});
