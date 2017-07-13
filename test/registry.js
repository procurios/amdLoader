var test = require('tape');
var amdModuleFactory = require('../src/module');
var registry = require('../src/registry');

test('resolve single listener', function (t) {
    t.plan(1);

    var amdModule = amdModuleFactory.create('myModule', '/');
    var result = false;

    registry.addListener(amdModule, function () {
        result = true;
    });

    registry.resolve(amdModule);
    t.true(result);
});

test('resolve multiple listeners', function (t) {
    t.plan(4);

    var amdModule = amdModuleFactory.create('myModule', '/');

    var result = [
        false,
        false,
        false,
        false
    ];

    registry.addListener(amdModule, function () {
        result[0] = true;
    });
    registry.addListener(amdModule, function () {
        result[1] = true;
    });
    registry.addListener(amdModule, function () {
        result[2] = true;
    });
    registry.addListener(amdModule, function () {
        result[3] = true;
    });

    registry.resolve(amdModule);

    for (var i = 0; i < result.length; i++) {
        t.true(result[i]);
    }
});

test('apply each listener only once', function (t) {
    t.plan(4);

    var amdModule = amdModuleFactory.create('myModule', '/');

    var result = [
        0,
        0,
        0,
        0
    ];

    registry.addListener(amdModule, function () {
        result[0]++;
    });
    registry.addListener(amdModule, function () {
        result[1]++;
    });
    registry.addListener(amdModule, function () {
        result[2]++;
    });
    registry.addListener(amdModule, function () {
        result[3]++;
    });

    registry.resolve(amdModule);
    registry.resolve(amdModule);

    for (var i = 0; i < result.length; i++) {
        t.equal(result[i], 1);
    }
});

test('never registers the same module twice', function (t) {
    t.plan(1);

    var newModule = amdModuleFactory.create('foo', 'foo.js');
    var newModule2 = amdModuleFactory.create('foo', 'foo.js');

    registry.registerModule(newModule);
    registry.registerModule(newModule2);

    t.equal(registry.getModule('foo'), newModule);
});

test('returns null for unknown modules', function (t) {
    t.plan(1);
    t.equal(registry.getModule('fooBarBaz'), null);
});
