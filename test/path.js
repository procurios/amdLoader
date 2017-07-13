var test = require('tape');
var path = require('../src/path');
var moduleFactory = require('../src/module');

test('resolve predefined paths', function (t) {
    t.plan(3);

    t.equal(path.get('prototype'), '/a/userinterface/uibase/script/prototype/prototype.js');
    t.equal(path.get('domReady'), '/a/userinterface/uibase/vendor/domready/ready.min.js');
    t.equal(path.get('tinymce4'), '/files/mod_editor/vendor/tinymce/4.5.7/tinymce.min.js');
});

test('resolve path relative to predefined path', function (t) {
    t.plan(3);

    t.equal(path.get('pb/load'), '/a/userinterface/uibase/script/pblib/load.js');
    t.equal(path.get('vendor/json3/lib/json3'), '/a/userinterface/uibase/vendor/json3/lib/json3.js');
    t.equal(path.get('oldComponent/lightbox/pbuic-lightbox'), '/a/userinterface/uibase/components/lightbox/pbuic-lightbox.js');
});

test("path that can't be resolved is untouched", function (t) {
    t.plan(2);

    t.equal(path.get('pblib/foo'), 'pblib/foo');
    t.equal(path.get('//example.com/example.js'), '//example.com/example.js');
});

test("resolving path for a package", function (t) {
    t.plan(2);

    t.equal(path.get('moment'), '/a/userinterface/uibase/vendor/moment/moment.js');
    t.equal(path.get('moment/min/moment.min'), '/a/userinterface/uibase/vendor/moment/min/moment.min.js');
});

test("resolving relative paths", function (t) {
    t.plan(7);

    var context = moduleFactory.create('context', '//domain.com/foo/bar/quux.js');

    t.equal(path.get('./baz', context), '//domain.com/foo/bar/baz.js');
    t.equal(path.get('../baz', context), '//domain.com/foo/baz.js');
    t.equal(path.get('../../baz', context), '//domain.com/baz.js');
    t.equal(path.get('../baz/../qux', context), '//domain.com/foo/qux.js');

    context = moduleFactory.create('context', 'https://domain.com/foo/bar.js');

    t.equal(path.get('../baz', context), 'https://domain.com/baz.js');
    t.throws(function () {
        path.get('../../../baz', context);
    }, Error);
    t.throws(function () {
        path.get('../../../../baz', context);
    }, Error);
});

test("path always has a single extension", function (t) {
    t.plan(2);
    t.equal(path.get('//domain.com/foo.js'), '//domain.com/foo.js');
    t.equal(path.get('pb/load.js'), '/a/userinterface/uibase/script/pblib/load.js');
});
