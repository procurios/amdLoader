var test = require('tape');
var moduleFactory = require('../src/module');
var normalizeResource = require('../src/normalizeResource');

test('relative paths (as resource) are resolved', function (t) {
    t.plan(1);
    var context = moduleFactory.create('context', 'this/is/its/path.js');
    var moduleId = 'context!./foobar';
    t.equal(normalizeResource(moduleId, context), 'this/is/its/foobar.js');
});
