import { module, test } from 'qunit';
import {
  INBOUND_SILENCE_DAYS,
  INBOUND_SILENCE_MS,
  INBOUND_SILENCE_TEXT,
  isInboundSilent,
} from 'land/utils/whatsapp-silence';

const NOW = Date.parse('2026-11-23T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

module('Unit | Utility | whatsapp-silence', function () {
  test('the threshold is seven days', function (assert) {
    assert.strictEqual(INBOUND_SILENCE_DAYS, 7);
    assert.strictEqual(INBOUND_SILENCE_MS, INBOUND_SILENCE_DAYS * DAY);
  });

  test('the banner text states the same number of days as the threshold', function (assert) {
    assert.strictEqual(
      INBOUND_SILENCE_TEXT,
      'No message received in 7 days. Please send a test message to confirm the connection is active.',
    );
  });

  test('a connected number with no inbound for seven days is silent', function (assert) {
    const connection = {
      status: 'connected',
      connectedAt: iso(NOW - 60 * DAY),
      lastInboundAt: iso(NOW - 7 * DAY),
    };
    assert.true(isInboundSilent(connection, NOW));
  });

  test('a flagged number is measured too', function (assert) {
    const connection = {
      status: 'flagged',
      connectedAt: iso(NOW - 60 * DAY),
      lastInboundAt: iso(NOW - 8 * DAY),
    };
    assert.true(isInboundSilent(connection, NOW));
  });

  test('a recent inbound is not silent', function (assert) {
    const connection = {
      status: 'connected',
      connectedAt: iso(NOW - 60 * DAY),
      lastInboundAt: iso(NOW - 6 * DAY),
    };
    assert.false(isInboundSilent(connection, NOW));
  });

  test('a fresh connection is not silent even with an old or missing inbound', function (assert) {
    assert.false(
      isInboundSilent(
        {
          status: 'connected',
          connectedAt: iso(NOW - DAY),
          lastInboundAt: iso(NOW - 40 * DAY),
        },
        NOW,
      ),
    );
    assert.false(
      isInboundSilent(
        {
          status: 'connected',
          connectedAt: iso(NOW - DAY),
          lastInboundAt: null,
        },
        NOW,
      ),
    );
  });

  test('an old connection that never received anything is silent', function (assert) {
    const connection = {
      status: 'connected',
      connectedAt: iso(NOW - 10 * DAY),
      lastInboundAt: null,
    };
    assert.true(isInboundSilent(connection, NOW));
  });

  test('disconnected, pending or missing connections are never silent', function (assert) {
    const old = { connectedAt: iso(NOW - 60 * DAY), lastInboundAt: null };
    assert.false(isInboundSilent({ ...old, status: 'disconnected' }, NOW));
    assert.false(isInboundSilent({ ...old, status: 'pending' }, NOW));
    assert.false(isInboundSilent(null, NOW));
  });

  test('no dates at all is not silent', function (assert) {
    assert.false(
      isInboundSilent(
        { status: 'connected', connectedAt: null, lastInboundAt: null },
        NOW,
      ),
    );
  });
});
