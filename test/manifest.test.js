'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const manifest = require('../package.json');

test('automatic ghost text is the extension default', () => {
  assert.equal(
    manifest.contributes.configuration.properties['autocompleteCodex.triggerMode'].default,
    'automatic',
  );
  assert.ok(
    manifest.contributes.commands.some(
      (command) => command.command === 'autocompleteCodex.enableAutomatic',
    ),
  );
});
