import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

// Pins the idle/loaded split and bar maths for the lead-ownership panel.
module('Unit | Controller | dashboard', function (hooks) {
  setupTest(hooks);

  function agent(name, over = {}) {
    return {
      agentId: `agent-${name.toLowerCase().replace(/\s+/g, '-')}`,
      agentName: name,
      openTotal: 0,
      won: 0,
      lost: 0,
      stages: [],
      ...over,
    };
  }

  function makeController(ctx, ownership = {}, model = {}) {
    const controller = ctx.owner.lookup('controller:dashboard');
    controller.model = {
      failed: [],
      kpis: null,
      revenueTrend: [],
      ...model,
      ownership: {
        agents: [],
        pipeline: [],
        won: 0,
        lost: 0,
        unassignedOpen: 0,
        ...ownership,
      },
    };
    return controller;
  }

  test('an empty model does not break any getter', function (assert) {
    const controller = this.owner.lookup('controller:dashboard');
    controller.model = null;

    assert.false(controller.loadFailed);
    assert.deepEqual(controller.revenuePoints, []);
    assert.deepEqual(controller.pipelineStages, []);
    assert.deepEqual(controller.agentRows, []);
    assert.deepEqual(controller.idleAgents, []);
    assert.strictEqual(controller.occupancyRate, 0);
    assert.strictEqual(controller.assignmentText, 'No open leads');
    assert.strictEqual(controller.closedText, 'None in the last 30 days');
  });

  test('a failed endpoint is reported', function (assert) {
    const controller = makeController(this, {}, { failed: ['/reports/x'] });
    assert.true(controller.loadFailed);
  });

  test('revenuePoints turns the API strings into numbers', function (assert) {
    const controller = makeController(
      this,
      {},
      {
        revenueTrend: [
          { month: '2026-01', total: '1200.5' },
          { month: '2026-02', total: null },
        ],
      },
    );

    assert.deepEqual(controller.revenuePoints, [
      { month: '2026-01', value: 1200.5 },
      { month: '2026-02', value: 0 },
    ]);
  });

  test('occupancy is leased units over total units', function (assert) {
    const controller = makeController(
      this,
      {},
      { kpis: { totalUnits: 8, activeLeases: 3 } },
    );
    assert.strictEqual(controller.occupancyRate, 38, 'rounded');

    controller.model = { kpis: { totalUnits: 0, activeLeases: 4 } };
    assert.strictEqual(controller.occupancyRate, 0, 'no units, no division');
  });

  module('assignment split', function () {
    const PIPELINE = [
      { stage: 'NEW', count: 6 },
      { stage: 'CONTACTED', count: 4 },
    ];

    test('assigned is the census total less the unassigned', function (assert) {
      const controller = makeController(this, {
        pipeline: PIPELINE,
        unassignedOpen: 3,
      });

      assert.strictEqual(controller.openLeadTotal, 10);
      assert.strictEqual(controller.assignedOpen, 7);
      assert.strictEqual(
        controller.assignmentText,
        '7 assigned · 3 unassigned',
      );
    });

    test('assigned never goes negative when the counts disagree', function (assert) {
      const controller = makeController(this, {
        pipeline: [{ stage: 'NEW', count: 2 }],
        unassignedOpen: 5,
      });

      assert.strictEqual(controller.assignedOpen, 0);
    });

    test('an empty pipeline says so instead of showing zeros', function (assert) {
      const controller = makeController(this, {
        pipeline: [],
        unassignedOpen: 0,
      });

      assert.strictEqual(controller.assignmentText, 'No open leads');
      assert.deepEqual(controller.assignmentSegments, []);
    });

    test('a side with nothing in it gets no segment', function (assert) {
      const controller = makeController(this, {
        pipeline: PIPELINE,
        unassignedOpen: 0,
      });

      const segments = controller.assignmentSegments;
      assert.deepEqual(
        segments.map((s) => [s.stage, s.variant, s.count]),
        [['ASSIGNED', 'primary', 10]],
      );
      assert.strictEqual(segments[0].style.toString(), '--seg-width:100.00%;');
    });
  });

  module('closed outcomes', function () {
    test('won and lost are listed only when they happened', function (assert) {
      const controller = makeController(this, { won: 2, lost: 0 });
      assert.strictEqual(controller.closedText, '2 won');

      controller.model = { ownership: { won: 2, lost: 1 } };
      assert.strictEqual(controller.closedText, '2 won · 1 lost');
    });

    test('closed segments keep the outcome colours', function (assert) {
      const controller = makeController(this, { won: 3, lost: 1 });

      assert.deepEqual(
        controller.closedSegments.map((s) => [s.stage, s.variant, s.tooltip]),
        [
          ['WON', 'success', '3 won'],
          ['LOST', 'danger', '1 lost'],
        ],
      );
    });
  });

  module('agent rows', function () {
    test('an agent with nothing counted is idle, one with only closed deals is not', function (assert) {
      const controller = makeController(this, {
        agents: [
          agent('Test User', {
            openTotal: 2,
            stages: [{ stage: 'NEW', count: 2 }],
          }),
          agent('Closer Only', { won: 1 }),
          agent('Idle Person'),
        ],
      });

      assert.deepEqual(
        controller.loadedAgents.map((a) => a.agentName),
        ['Test User', 'Closer Only'],
      );
      assert.deepEqual(
        controller.idleAgents.map((a) => a.agentName),
        ['Idle Person'],
      );
    });

    test('initials come off the name, never blank', function (assert) {
      const controller = makeController(this, {
        agents: [
          agent('Test User'),
          agent('Solo'),
          agent('  '),
          agent('One Two Three'),
        ],
      });

      assert.deepEqual(
        controller.idleAgents.map((a) => a.initials),
        ['TU', 'S', '?', 'OT'],
      );
    });

    test('the idle label names only the avatars on screen', function (assert) {
      const names = Array.from({ length: 10 }, (_, i) => `Agent ${i + 1}`);
      const controller = makeController(this, {
        agents: names.map((name) => agent(name)),
      });

      assert.strictEqual(controller.visibleIdleAgents.length, 8);
      assert.strictEqual(controller.hiddenIdleCount, 2);
      assert.strictEqual(
        controller.idleLabel,
        `10 agents with no leads: ${names.slice(0, 8).join(', ')} and 2 more`,
      );
      assert.false(
        controller.idleLabel.includes('Agent 9'),
        'a hidden agent is not named',
      );
    });

    test('one idle agent reads as one agent with no remainder', function (assert) {
      const controller = makeController(this, {
        agents: [agent('Test User')],
      });

      assert.strictEqual(
        controller.idleLabel,
        '1 agent with no leads: Test User',
      );
      assert.strictEqual(controller.hiddenIdleCount, 0);
    });

    test('only the first rows are built, and the rest are counted', function (assert) {
      const controller = makeController(this, {
        agents: Array.from({ length: 9 }, (_, i) =>
          agent(`Agent ${i + 1}`, { openTotal: 1 }),
        ),
      });

      assert.strictEqual(controller.agentRows.length, 6);
      assert.strictEqual(controller.hiddenAgentCount, 3);
    });

    test('a row segments every counted lead, closed included', function (assert) {
      const controller = makeController(this, {
        agents: [
          agent('Test User', {
            openTotal: 3,
            won: 1,
            lost: 0,
            stages: [
              { stage: 'NEW', count: 3 },
              { stage: 'VIEWING', count: 0 },
            ],
          }),
        ],
      });

      const [row] = controller.agentRows;
      assert.strictEqual(row.initials, 'TU');
      assert.deepEqual(
        row.segments.map((s) => [s.stage, s.variant, s.style.toString()]),
        [
          ['NEW', 'stage-new', '--seg-width:75.00%;'],
          ['WON', 'success', '--seg-width:25.00%;'],
        ],
        'an empty stage is dropped and the rest share the row',
      );
    });

    test('a row spells out its own breakdown for assistive tech', function (assert) {
      const controller = makeController(this, {
        agents: [
          agent('Test User', {
            openTotal: 3,
            won: 1,
            lost: 2,
            stages: [
              { stage: 'NEW', count: 2 },
              { stage: 'CONTACTED', count: 1 },
              { stage: 'VIEWING', count: 0 },
            ],
          }),
        ],
      });

      assert.strictEqual(
        controller.agentRows[0].label,
        'Test User, 3 open leads, 2 new, 1 contacted, 1 won, 2 lost in the last 30 days',
      );
    });

    test('an agent with no closed deals says nothing about them', function (assert) {
      const controller = makeController(this, {
        agents: [
          agent('Test User', {
            openTotal: 1,
            stages: [{ stage: 'NEW', count: 1 }],
          }),
        ],
      });

      assert.strictEqual(
        controller.agentRows[0].label,
        'Test User, 1 open leads, 1 new',
      );
    });

    test('an unknown stage still gets a colour', function (assert) {
      const controller = makeController(this, {
        agents: [
          agent('Test User', {
            openTotal: 1,
            stages: [{ stage: 'RENEGOTIATING', count: 1 }],
          }),
        ],
      });

      assert.strictEqual(
        controller.agentRows[0].segments[0].variant,
        'primary',
      );
    });

    test('buildSegments survives an empty list', function (assert) {
      const controller = makeController(this);

      assert.deepEqual(controller.buildSegments([]), []);
    });
  });

  module('pipeline bars', function () {
    test('a bar is a share of the biggest stage', function (assert) {
      const controller = makeController(this, {
        pipeline: [
          { stage: 'NEW', count: 10 },
          { stage: 'CONTACTED', count: 5 },
        ],
      });

      assert.strictEqual(controller.maxPipelineCount, 10);
      assert.strictEqual(controller.computeBarWidth(10), 100);
      assert.strictEqual(controller.computeBarWidth(5), 50);
      assert.strictEqual(
        controller.buildBarStyle(5).toString(),
        '--bar-width:50%;',
      );
    });

    test('an empty stage keeps a visible sliver', function (assert) {
      const controller = makeController(this, {
        pipeline: [{ stage: 'NEW', count: 100 }],
      });

      assert.strictEqual(controller.computeBarWidth(0), 2);
      assert.strictEqual(controller.computeBarWidth(1), 2, 'floored at 2');
    });

    test('an empty pipeline never divides by zero', function (assert) {
      const controller = makeController(this, { pipeline: [] });

      assert.strictEqual(controller.maxPipelineCount, 1);
      assert.strictEqual(controller.computeBarWidth(0), 2);
    });
  });

  test('regionLabel names the active region, or all of them', function (assert) {
    const controller = makeController(this);
    controller.region.activeRegion = null;
    assert.strictEqual(controller.regionLabel, 'All Regions');

    controller.region.activeRegion = { code: 'dxb', name: 'Dubai' };
    assert.strictEqual(controller.regionLabel, 'Dubai');
  });
});
