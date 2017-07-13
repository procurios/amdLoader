amdLoader
==========

Another implementation of the CommonJS [Asynchronous Module Definition (AMD)][spec] specification.

[spec]: http://github.com/amdjs/amdjs-api/wiki/AMD

Why another?
-------------

There are a quite a few implementations out there already (for example [RequireJS][rjs], [almond][almond] and [curl.js][curl]).

[rjs]: http://requirejs.org/
[almond]: https://github.com/jrburke/almond
[curl]: http://github.com/unscriptable/curl

The implementations that I have seen tend to be monolithic, hard to extend and inflexible. For example: `require.js` crashes
when loading a file if `require.js` is active (eg. a script that calls `define()` anonymously).

Features
---------

This loader supports:

- Loading named & anonymous modules
- Loading external resources
- Loading non-AMD resources
- Loader plugins
- Usage of globals, packages and predefined paths
- Normalization of relative paths

Building
---------

The source can be found in `amdLoader/src`. A ready-made combined file that includes all functionality is available in `amdLoader/dist`.

If you want to build the files yourself, make sure to install the dependencies using `npm install` first. Then run `npm build`
to update the build files located in `amdLoader/dist`.

If you're working on the source files, run `npm start` to watch the source files and build them automatically after changing
one of the source files.

Tests
------

The unit tests depend on the following packages:

```bash
$ npm install -g tape
$ npm install -g browserifyy
$ npm install -g testling
$ npm install -g phantomjs
$ npm install -g faucet
```

[tape][tape] is a tap-producing test harness for node and browsers. Pipe it through [faucet][faucet] to make its output 
 friendly to read. [browserify][browserify], [testling][testling], and [phantomjs][phantomjs] are needed to run the tests in a headless browser environment.

[tape]: https://github.com/substack/tape
[faucet]: https://www.npmjs.com/package/faucet
[browserify]: http://browserify.org
[testling]: https://ci.testling.com
[phantomjs]: http://phantomjs.org/

To run the tests:

```bash
# Test a single file using tape
$ tape normalizeId.js | faucet

# Test all files using testling
$ browserify *.js | testling | faucet
```

Source files
-------------

`amdLoader` is made up of several files, of which the following:

| file                 | description
| -------------------- | --------------------------------------------------------------------------
| define.js            | core functionality (eg. `require` and `define` methods)
| loader.js            | responsible for inserting and loading modules on demand
| normalizeId.js       | responsible for (module) id normalization
| normalizeResource.js | responsible for (sub) resource normalization
| path.js              | responsible for resolving (relative) paths
| registry.js          | responsible for registering and resolving dependencies for loaded modules
| globals.js           | allows registration of globals

