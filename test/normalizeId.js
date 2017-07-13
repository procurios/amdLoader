var test = require('tape');
var normalizeId = require('../src/normalizeId');

test('resource is stripped from id', function (t) {
    t.plan(1);
    var moduleId = 'foo!bar';
    t.equal(normalizeId(moduleId), 'foo');
});

test('id without resource is left untouched', function (t) {
    t.plan(1);
    var moduleId = 'fooBar';
    t.equal(normalizeId(moduleId), 'fooBar');
});
