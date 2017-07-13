var test = require('tape');

var moduleFactory = require('../src/module');
var loader = require('../src/loader');

test('load a module', function (t) {
    t.plan(1);

    var moduleToLoad = moduleFactory.create('z', 'fixtures/z.js');

    loader.load(moduleToLoad, function (moduleId) {
        t.equal(moduleId, 'z');
    });
});

test('loading module with invalid path should throw an error', function (t) {
    t.plan(1);

    var moduleWithInvalidPath = moduleFactory.create('invalidPath', 'invalid/path');

    try {
        loader.load(moduleWithInvalidPath);
    } catch (e) {
        t.pass();
    }
});

test('modules with valid paths should be loaded', function (t) {
    try {
        loader.load(moduleFactory.create('validPath', '//foo'));
        loader.load(moduleFactory.create('validPath2', 'http://foo'));
        loader.load(moduleFactory.create('validPath3', 'https://foo'));
        loader.load(moduleFactory.create('validPath4', 'foo.js'));
    } catch (e) {
        t.fail();
    }

    t.end();
});