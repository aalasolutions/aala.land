import { module, test } from 'qunit';
import { parseMessageText } from 'land/utils/message-format';

const text = (value) => ({ type: 'text', value });

module('Unit | Utility | message-format', function () {
  test('parses bold, italic, strike and inline code', function (assert) {
    assert.deepEqual(
      parseMessageText(
        'yaar *bold* and _italic_ and ~something~ .. and `codeblock`',
      ),
      [
        text('yaar '),
        { type: 'bold', children: [text('bold')] },
        text(' and '),
        { type: 'italic', children: [text('italic')] },
        text(' and '),
        { type: 'strike', children: [text('something')] },
        text(' .. and '),
        { type: 'code', value: 'codeblock' },
      ],
    );
  });

  test('markers inside words or next to spaces stay plain', function (assert) {
    for (const plain of [
      '2*3*4',
      'snake_case_name',
      'a * b * c',
      '*hello*world',
      'file_name.txt',
      '* not bold*',
      '*not bold *',
      '*unclosed',
      '**',
    ]) {
      assert.deepEqual(parseMessageText(plain), [text(plain)], plain);
    }
  });

  test('formatting nests', function (assert) {
    assert.deepEqual(parseMessageText('*_both_*'), [
      {
        type: 'bold',
        children: [{ type: 'italic', children: [text('both')] }],
      },
    ]);
  });

  test('a span never crosses a line break', function (assert) {
    assert.deepEqual(parseMessageText('*a\nb*'), [text('*a\nb*')]);
  });

  test('a fenced block keeps its lines and its markers raw', function (assert) {
    assert.deepEqual(parseMessageText('see ```line 1\n*line 2*``` done'), [
      text('see '),
      { type: 'pre', value: 'line 1\n*line 2*' },
      text(' done'),
    ]);
  });

  test('inline code keeps markers raw', function (assert) {
    assert.deepEqual(parseMessageText('`*not bold*`'), [
      { type: 'code', value: '*not bold*' },
    ]);
  });

  test('a link inside formatting stays a link', function (assert) {
    assert.deepEqual(parseMessageText('*see https://aala.land/units*'), [
      {
        type: 'bold',
        children: [
          text('see '),
          {
            type: 'link',
            value: 'https://aala.land/units',
            href: 'https://aala.land/units',
            host: 'aala.land',
          },
        ],
      },
    ]);
  });

  test('markers inside a link never format it', function (assert) {
    const nodes = parseMessageText('https://example.com/a_b_c_d and _x_');
    assert.strictEqual(nodes[0].type, 'link');
    assert.strictEqual(nodes[0].value, 'https://example.com/a_b_c_d');
    assert.deepEqual(nodes.slice(1), [
      text(' and '),
      { type: 'italic', children: [text('x')] },
    ]);
  });

  test('works in right-to-left text', function (assert) {
    assert.deepEqual(parseMessageText('مرحبا *أهلا*'), [
      text('مرحبا '),
      { type: 'bold', children: [text('أهلا')] },
    ]);
  });

  test('empty text has no nodes', function (assert) {
    assert.deepEqual(parseMessageText(''), []);
    assert.deepEqual(parseMessageText(null), []);
  });
});
