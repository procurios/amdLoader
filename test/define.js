var test = require('tape');
require('../src/define');

test('require a single module', function (t) {
    t.plan(1);

    window.require(['fixtures/a.js'], function (a) {
         t.equal(a.get(), 'a');
    });
});

test('require multiple modules', function (t) {
    t.plan(2);

    window.require(['fixtures/a.js', 'fixtures/b.js'], function (a, b) {
        t.equal(a.get(), 'a');
        t.equal(b.get(), 'b');
    });
});

test('`define` defines a module', function (t) {
    t.plan(1);

    window.define('myModule', [], function () {
        return {
            getName: function () {
                return 'myModule';
            }
        };
    });

    window.require(['myModule'], function (myModule) {
        t.equal(myModule.getName(), 'myModule');
    });
});

test('require modules with dependencies', function (t) {
    t.plan(1);

    window.require(['fixtures/d.js'], function (d) {
        t.equal(d.get(), 'd');
    });
});

test('resource value is passed to plugin', function (t) {
    t.plan(1);

    window.require(['fixtures/e.js!fooBar'], function (e) {
        console.log(e);
        t.equal(e.isResourceProcessed('fooBar'), true);
    });
});

test('require without dependencies is processed synchronously', function (t) {
    t.plan(1);

    window.require(function () {
        t.ok(1);
    });
});

test('local require resolves relative URLs', function (t) {
    t.plan(1);

    window.require(['fixtures/f.js'], function (f) {
        f.getG(function (value) {
            t.equal(value, 'g');
        });
    });
});

test('does not load a given module more than once', function (t) {
    t.plan(4);

    var initialNumberOfScripts = document.scripts.length;

    window.require(['fixtures/h.js'], function (a) {
        t.equal(a.get(), 'a');
        callback();
    });

    window.require(['fixtures/h.js'], function (a) {
        t.equal(a.get(), 'a');
        callback();
    });

    function callback () {
        var currentNumberOfScripts = document.scripts.length;
        t.equal(currentNumberOfScripts, initialNumberOfScripts + 1);
    }
});

test('synchronously returns module export for loaded modules', function (t) {
    t.plan(1);

    var a = window.require('fixtures/a.js');
    t.equals(a.get(), 'a');
});

test('errors when synchronously requested module isnt loaded', function (t) {
    t.plan(1);

    try {
        window.require('not-loaded.js');
    } catch (e) {
        t.ok(1);
    }
});

test('resolves modules in correct order', function (t) {
    t.plan(3);

    var a = {};
    var b = {};
    var c = {};

    define('myModule2', ['a', 'b', 'c'], function (localA, localB, localC) {
        t.equal(localA, a);
        t.equal(localB, b);
        t.equal(localC, c);
    });

    define('a', function () {
     return a;
    });

    define('b', function () {
     return b;
    });

    window.setTimeout(function () {
        window.define('c', function () {
            return c;
        });
    }, 100);
});

test('provides magic modules to `define`', function (t) {
    t.plan(3);

    define('myModule3', ['require', 'exports', 'module'], function (require, exports, module) {
        t.ok(exports, {});
        t.equal(module.id, 'myModule3');
        t.equal(module.uri, 'myModule3');
    });
});

test('relative module ids are resolved', function (t) {
    define('procurios/modules/module1', ['./module2', '../packages/package1'], function () {
        t.pass();
        t.end();
        return {};
    });

    define('procurios/modules/module2', function () {
        return {};
    });

    define('procurios/packages/package1', function () {
        return {};
    });
});

test('relative module ids are rewritten', function (t) {
    t.plan(1);

    define('procurios/module', ['./module2'], function (module2) {
        t.equal(module2.getId(), 'procurios/module2');
    });

    define('procurios/module2', ['module'], function (module) {
        return {
            getId: function () {
                return module.id;
            }
        };
    });
});

test('module can be defined with fixed value instead of a definition', function (t) {
    t.plan(1);

    define('moduleWithFixedValue', {
        get: 'fixedValue'
    });

    var valueToTest = window.require('moduleWithFixedValue');
    t.equal(valueToTest.get, 'fixedValue');
});

test('non-AMD files can be loaded and defined as a module', function (t) {
    window.require(['fixtures/z.js'], function () {
        t.pass();
        t.end();
    });
});