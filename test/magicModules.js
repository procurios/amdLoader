var test = require('tape');
var moduleFactory = require('../src/module');
var magicModules = require('../src/magicModules');

test('local require resolves relative URLs', function (t) {
    t.plan(1);

    var context = moduleFactory.create('contextForLocalRequire', '/path/to/context.js');
    var localRequire = magicModules.getLocalRequire(context).getValue();

    t.equal(localRequire.toUrl('../relativePath'), '/path/relativePath.js');
});

test('exports module exports module value', function (t) {
    t.plan(2);

    var context = moduleFactory.create('contextForExports', '/path/to/context.js');
    context.setValue({foo: 'foo', bar: 'bar'});
    var exportsModule = magicModules.getExports(context);

    t.equal(exportsModule.getValue().foo, 'foo');
    t.equal(exportsModule.getValue().bar, 'bar');
});

test('changing exports changes module value', function (t) {
    t.plan(1);

    var context = moduleFactory.create('contextForExports', '/path/to/context.js');
    context.setValue({foo: 'foo'});
    var exportsModule = magicModules.getExports(context);
    exportsModule.getValue().foo = 'changedFoo';

    t.equal(context.getValue().foo, 'changedFoo');
});

test('the module module provides meta data', function (t) {
    t.plan(2);

    var context = moduleFactory.create('contextForModule', '/path/to/context.js');
    var moduleModule = magicModules.getModule(context);

    t.equal(moduleModule.getValue().id, 'contextForModule');
    t.equal(moduleModule.getValue().uri, '/path/to/context.js');
});