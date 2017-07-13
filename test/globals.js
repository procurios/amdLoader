var test = require('tape');
var globals = require('../src/globals');

test('recognize global', function (t) {
    t.plan(1);
    t.equal(globals.isGlobal('pb/pblib'), true);
});

test('value of unavailable global', function (t) {
    t.plan(1);
    t.equal(globals.get('pb/pblib'), null);
});

test('global is returned if it is available', function (t) {
    t.plan(2);

    window.PbLib = {
       isDefined: true
    };

    t.equal(globals.get('pb/pblib'), window.PbLib);
    t.equal(globals.get('pb/pblib').isDefined, true);
});