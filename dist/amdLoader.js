(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function () {
    'use strict';

    if ('define' in window && 'require' in window) {
        return;
    }

    var E_MALFORMED_REQUIRE = 'Malformed require';
    var E_REQUIRE_FAILED = 'Require failed (module not loaded)';

    /** @type {Function} */
    var normalizeId = require('./normalizeId');
    /** @type {Function} */
    var normalizeResource = require('./normalizeResource');
    /** @type {Object} */
    var amdModule = require('./module');
    /** @type {Object} */
    var path = require('./path');
    /** @type {Object} */
    var registry = require('./registry');
    /** @type {Object} */
    var magicModules = require('./magicModules');
    /** @type {Object} */
    var loader = require('./loader');
    /** @type {Object} */
    var globals = require('./globals');

    /** @type {Object} */
    var defineQueue = {};
    /** @type {Object} */
    var defineHistory = {};

    /**
     * @param {string|Array|Function} moduleId
     * @param {Array|Function} dependencies
     * @param {Function} definition
     */
    window.define = function (moduleId, dependencies, definition) {
        if (typeof moduleId !== 'string') {
            definition = dependencies;
            dependencies = moduleId;
            moduleId = null;
        }

        if (!dependencies || !(dependencies instanceof Array)) {
            definition = dependencies;
            dependencies = [];
        }

        if (moduleId === null) {
            if (loader.useInteractive()) {
                moduleId = loader.getIdOfCurrentlyExecutingModule();
            }

            defineQueue[moduleId || 'last'] = [moduleId, dependencies, definition];
            return;
        }

        moduleId = normalizeId(moduleId);
        defineHistory[moduleId] = true;
        var moduleToDefine = registry.getModule(moduleId) || amdModule.create(moduleId, path.get(moduleId));
        registry.registerModule(moduleToDefine);

        if (dependencies.length < 1) {
            definition && moduleToDefine.setValue(
                typeof definition === 'function' ? definition() : definition
            );
            registry.resolve(moduleToDefine);
            return;
        }

        queueDependencies(dependencies, function () {
            definition && moduleToDefine.setValue(definition.apply(null, arguments));
            registry.resolve(moduleToDefine);
        }, moduleToDefine);
    };

    /**
     * @param {Array|string|Function} dependencies
     * @param {Function} definition
     * @param {amdModule} context
     * @returns {*}
     */
    window.require = function (dependencies, definition, context) {
        if (!dependencies && !definition) {
            throw new Error(E_MALFORMED_REQUIRE);
        }

        if (dependencies instanceof Array) {
            queueDependencies(dependencies, definition, context);
            return;
        }

        if (typeof dependencies === 'string') {
            var moduleId = normalizeId(dependencies);
            var loadedModule = registry.getModule(moduleId);

            if (!loadedModule || !loadedModule.isDefined()) {
                throw new Error(E_REQUIRE_FAILED);
            }

            return loadedModule.getValue();
        }

        if (typeof dependencies === 'function' && !definition) {
            dependencies();
            return;
        }

        throw new Error(E_MALFORMED_REQUIRE);
    };

    /**
     * @param {string} moduleId
     * @param {string} modulePath
     * @returns {amdModule}
     */
    function createAndLoadModule (moduleId, modulePath) {
        if (registry.getModule(moduleId)) {
            return registry.getModule(moduleId);
        }

        var newModule = amdModule.create(moduleId, modulePath);
        registry.registerModule(newModule);

        if (!newModule.isDefined()) {
            try {
                loader.load(newModule, finishDefining);
            } catch (e) {
                return newModule;
            }
        }

        return newModule;
    }

    /**
     * @param {string} loadedModuleId
     */
    function finishDefining (loadedModuleId) {
        if (
            !(loadedModuleId in defineQueue)
            && !('last' in defineQueue)
            && !globals.isGlobal(loadedModuleId)
            && !(loadedModuleId in defineHistory)
        ) {
            var loadedModule = registry.getModule(loadedModuleId);
            loadedModule && loadedModule.setDefined() && registry.resolve(loadedModule);
            return;
        }

        var defineArguments = null;

        if (loader.useInteractive() && loadedModuleId in defineQueue) {
            defineArguments = defineQueue[loadedModuleId];
            delete defineQueue[loadedModuleId];
        } else if (!loader.useInteractive()) {
            defineArguments = defineQueue['last'] || [];
            defineArguments[0] = loadedModuleId;
            delete defineQueue['last'];
        }

        if (!defineArguments) {
            return;
        }

        if (globals.isGlobal(loadedModuleId) && defineArguments.length === 1) {
            if (loadedModuleId in defineHistory) {
                // Global is apparently using AMD to register itself
                return;
            }

            defineArguments[1] = [];
            defineArguments[2] = function () { return globals.get(loadedModuleId); };
        }

        window.define.apply(null, defineArguments);
    }

    function queueDependencies () {
        var args = arguments;

        window.setTimeout(function () {
            loadDependencies.apply(null, args);
        }, 4);
    }

    /**
     * @param {Array} dependencies
     * @param {Function} definition
     * @param {amdModule} context
     */
    function loadDependencies (dependencies, definition, context) {
        var values = [];
        var loaded = 0;

        /**
         * @param {amdModule} loadedModule
         * @param {string} resource
         */
        function dependencyLoaded (loadedModule, resource) {
            if (resource) {
                var moduleValue = loadedModule.getValue();
                moduleValue.load(resource, function (loadedValue) {
                    applyDependencyValue(loadedModule.getId() + '!' + resource, loadedValue || moduleValue);
                });
                return;
            }

            applyDependencyValue(loadedModule.getId(), loadedModule.getValue());
        }

        /**
         * @param {string} moduleResourceId
         * @param {*} moduleValue
         */
        function applyDependencyValue (moduleResourceId, moduleValue) {
            values[dependencies.indexOf(moduleResourceId)] = moduleValue;

            if (definition && ++loaded >= dependencies.length) {
                definition.apply(null, values);
            }
        }

        /**
         * @param {string} moduleId
         * @param {string} resource
         */
        function loadDependency (moduleId, resource) {
            var moduleToLoad;

            switch (moduleId) {
                case 'require':
                    moduleToLoad = magicModules.getLocalRequire(context);
                    break;
                case 'exports':
                    moduleToLoad = magicModules.getExports(context);
                    break;
                case 'module':
                    moduleToLoad = magicModules.getModule(context);
                    break;
                default:
                    moduleToLoad = registry.getModule(moduleId) || createAndLoadModule(moduleId, path.get(moduleId, context));
            }

            registry.addListener(moduleToLoad, function (loadedModule) {
                dependencyLoaded(loadedModule, resource);
            });
        }

        for (var i = 0; i < dependencies.length; i++) {
            var moduleId = normalizeId(dependencies[i], context);
            var resource = normalizeResource(dependencies[i], context);
            dependencies[i] = (resource) ? moduleId + '!' + resource : moduleId;
            loadDependency(moduleId, resource);
        }
    }

    /**
     * @type {{jQuery: boolean}}
     */
    window.define.amd = {
        jQuery: true
    };
})();

},{"./globals":2,"./loader":3,"./magicModules":4,"./module":5,"./normalizeId":6,"./normalizeResource":7,"./path":8,"./registry":9}],2:[function(require,module,exports){
var getGlobals = (function (global) {
    'use strict';

    /** @type {Object} */
    var globals = {
        'pb/pblib': {
            name: 'PbLib',
            get: function () {
                if (!('PbLib' in global)) {
                    return null;
                }

                return global['PbLib'];
            }
        },
        prototype: {
            name: 'Prototype',
            get: function () {
                if (!('Prototype' in global)) {
                    return null;
                }

                return global['$'];
            }
        },
        tinymce4: {
            name: 'TinyMCE',
            get: function () {
                if (!('tinymce' in global)) {
                    return null;
                }

                return global['tinymce'];
            }
        },
        elementQueries: {
            name: 'elementQueries',
            get: function () {
                if (!('elementQueries' in global)) {
                    return null;
                }

                return global['elementQueries'];
            }
        },
        resizeSensor: {
            name: 'resizeSensor',
            get: function () {
                if (!('resizeSensor' in global)) {
                    return null;
                }

                return global['resizeSensor'];
            }
        }
    };

    /**
     * @param {string} moduleId
     * @returns {*}
     */
    function get (moduleId) {
        return globals[moduleId].get();
    }

    /**
     * @param {string} moduleId
     * @returns {boolean}
     */
    function isGlobal (moduleId) {
        return (moduleId in globals);
    }

    /**
     * @param {string} moduleId
     * @returns {boolean}
     */
    function isLoaded (moduleId) {
        return isGlobal(moduleId) && globals[moduleId].get() !== null;
    }

    return {
        isGlobal: isGlobal,
        isLoaded: isLoaded,
        get: get
    };
})(typeof window !== 'undefined' ? window : this);

module.exports = getGlobals;

},{}],3:[function(require,module,exports){
var getLoader = (function (global) {
    'use strict';

    /** @type {string} */
    var E_INVALID_PATH = 'Unable to load module: invalid path';

    /** @type {boolean} */
    var isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]';
    /** @type {boolean} */
    var useInteractive = false;
    /** @type {Element} */
    var currentlyAddingScript;
    /** @type {Element} */
    var interactiveScript;

    /** @type {Node} */
    var baseElement = document.getElementsByTagName('base')[0];
    /** @type {Node} */
    var head = baseElement ? baseElement.parentNode : document.getElementsByTagName('head')[0];

    /**
     * @param {amdModule} amdModule
     * @param {Function} defineCallback
     */
    function load (amdModule, defineCallback) {
        if (amdModule.getPath().match(/(^(\.{0,2}\/|(?:[a-z]+:)?\/\/)|\.js)/) === null) {
            throw new Error(E_INVALID_PATH);
        }

        var script = getScriptElement(amdModule);

        if (
            script.attachEvent
            && !(script.attachEvent.toString && script.attachEvent.toString().indexOf('[native code') < 0)
            && !isOpera
        ) {
            useInteractive = true;
            script.attachEvent('onreadystatechange', function (event) {
                onScriptLoad(script, event, defineCallback);
            });
        } else {
            script.addEventListener('load', function (event) {
                onScriptLoad(script, event, defineCallback);
            }, false);
            script.addEventListener('error', function () {
                if (!('console' in global)) {
                    return;
                }

                global['console'].error('`amdLoader`: Loading module `' + amdModule.getId() + '` failed, using script with url ' + amdModule.getPath());
            }, false);
        }

        script.src = amdModule.getPath();

        // noinspection JSUnusedAssignment currentlyAddingScript is used in getInteractiveScript
        currentlyAddingScript = script;

        head.insertBefore(script, baseElement || null);

        currentlyAddingScript = null;
    }

    /**
     * @param {HTMLElement} script
     * @param {Event} event
     * @param {Function} defineCallback
     */
    function onScriptLoad (script, event, defineCallback) {
        if (
            event.type === 'load'
            || (/^(complete|loaded)$/.test((event.currentTarget || event.srcElement).readyState))
        ) {
            interactiveScript = null;
            defineCallback(script.getAttribute('data-moduleId'));
            script.removeAttribute('data-moduleId');
        }
    }

    /**
     * @param {amdModule} amdModule
     * @returns {Element}
     */
    function getScriptElement (amdModule) {
        var script = document.createElement('script');
        script.async = true;
        script.setAttribute('data-moduleId', amdModule.getId());
        return script;
    }

    /**
     * @returns {Element}
     */
    function getInteractiveScript () {
        if (currentlyAddingScript !== null) {
            return currentlyAddingScript;
        }

        if (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }

        var scripts = document.getElementsByTagName('script');
        var l = scripts.length;

        while (l--) {
            var script = scripts[l];

            if (script.readyState === 'interactive') {
                return (interactiveScript = script);
            }
        }

        return null;
    }

    /**
     * @returns {string|null}
     */
    function getIdOfCurrentlyExecutingModule () {
        var script = getInteractiveScript();

        if (!script) {
            return null;
        }

        return script.getAttribute('data-moduleId') || null;
    }

    return {
        load: load,
        useInteractive: function () {
            return useInteractive;
        },
        getIdOfCurrentlyExecutingModule: getIdOfCurrentlyExecutingModule
    };
})(typeof window !== 'undefined' ? window : this);

module.exports = getLoader;

},{}],4:[function(require,module,exports){
var defaultModules = (function () {
    'use strict';

    /** @type {Function} */
    var normalizeId = require('./normalizeId');
    /** @type {Object} */
    var path = require('./path');
    /** @type {Object} */
    var amdModule = require('./module');

    /**
     * @param {amdModule} context
     * @returns {amdModule}
     */
    function getLocalRequire (context) {
        function localRequire () {
            var args = [].slice.call(arguments);
            args[2] = context || null;
            return window.require.apply(window, args);
        }

        localRequire['toUrl'] = function (moduleId) {
            return path.get(normalizeId(moduleId), context);
        };

        return amdModule.create('require').setValue(localRequire);
    }

    /**
     * @param {amdModule} context
     * @returns {amdModule}
     */
    function getExports (context) {
        var exports = amdModule.create('exports');
        exports.setValue(context.getValue());
        return exports;
    }

    /**
     * @param {amdModule} context
     * @returns {amdModule}
     */
    function getModule (context) {
        return amdModule.create('module').setValue({
            id: context.getId(),
            uri: context.getPath()
        });
    }

    return {
        getLocalRequire: getLocalRequire,
        getExports: getExports,
        getModule: getModule
    };
}());

module.exports = defaultModules;

},{"./module":5,"./normalizeId":6,"./path":8}],5:[function(require,module,exports){
var moduleFactory = (function () {
    'use strict';

    /** @type {Object} */
    var globals = require('./globals');

    /**
     * @param {string} normalizedId
     * @param {string} path
     */
    function amdModule (normalizedId, path) {
        this.id = normalizedId;
        this.path = path || null;
        this.value = null;
        this.exports = {};
        this.defined = false;

        if (globals.isGlobal(normalizedId) && globals.isLoaded(normalizedId)) {
            this.setValue(globals.get(normalizedId));
        }
    }

    /**
     * @returns {string}
     */
    amdModule.prototype.getId = function () {
        return this.id;
    };

    /**
     * @returns {string}
     */
    amdModule.prototype.getPath = function () {
        return this.path;
    };

    /**
     * @param {*} value
     * @returns {amdModule}
     */
    amdModule.prototype.setValue = function (value) {
        this.value = value;
        this.defined = true;
        return this;
    };

    /**
     * @returns {*|null}
     */
    amdModule.prototype.getValue = function () {
        return this.value || this.exports;
    };

    /**
     * @returns {boolean}
     */
    amdModule.prototype.isDefined = function () {
        return this.defined;
    };

    /**
     * @returns {amdModule}
     */
    amdModule.prototype.setDefined = function () {
        this.defined = true;
        return this;
    };

    return {
        /**
         * @param {string} id
         * @param {string} path
         * @returns {amdModule}
         */
        create: function (id, path) {
            return new amdModule(id, path);
        }
    };
}());

module.exports = moduleFactory;

},{"./globals":2}],6:[function(require,module,exports){
var getNormalizeId = (function () {
    'use strict';

    /** @type {Object} */
    var path = require('./path');

    /**
     * @param {string} moduleResourceId
     * @param {amdModule} context
     * @returns {string}
     */
    return function (moduleResourceId, context) {
        var moduleId = moduleResourceId.indexOf('!') < 0 ? moduleResourceId : moduleResourceId.split('!')[0];

        if (!context || moduleId.indexOf('./') < 0) {
            return moduleId;
        }

        return path.resolve(moduleId, context.getId());
    };
})();

module.exports = getNormalizeId;

},{"./path":8}],7:[function(require,module,exports){
var getNormalizeResource = (function () {
    'use strict';

    /** @type {Object} */
    var path = require('./path');

    /**
     * @param {string} moduleResourceId
     * @param {amdModule} context
     * @returns {string|null}
     */
    function normalizeResource (moduleResourceId, context) {
        if (!moduleResourceId || moduleResourceId.indexOf('!') < 0) {
            return null;
        }

        var resourceParts = moduleResourceId.split('!');

        if (resourceParts[1].indexOf('./') < 0) {
            return resourceParts[1];
        }

        return path.get(resourceParts[1], context);
    }

    return normalizeResource;
})();

module.exports = getNormalizeResource;

},{"./path":8}],8:[function(require,module,exports){
var path = (function () {
    'use strict';

    /**
     * @type {Object.string}
     */
    var paths = {
        pb: '/a/userinterface/uibase/script/pblib',
        prototype: '/a/userinterface/uibase/script/prototype/prototype',
        oldComponent: '/a/userinterface/uibase/components',
        domReady: '/a/userinterface/uibase/vendor/domready/ready.min',
        css: '/a/userinterface/uibase/vendor/procurios/amdLoader/src/plugins/css',
        knockout: '/a/userinterface/uibase/vendor/knockout/dist/knockout',
        knockoutmapping: '/a/userinterface/uibase/vendor/knockout-mapping/build/output/knockout.mapping-latest',
        tinymce4: '/files/mod_editor/vendor/tinymce/4.5.7/tinymce.min',
        vendor: '/a/userinterface/uibase/vendor',
        highcharts233: '/a/userinterface/uibase/vendor/highcharts-2.3.3',
        highcharts401: '/a/userinterface/uibase/vendor/highcharts-4.0.1',
        highcharts415: '/a/userinterface/uibase/vendor/highcharts-4.1.5',
        component: '/a/lib/Component/script',
        droplet: '/a/userinterface/uibase/droplets',
        module: '/a/userinterface/module',
        elementQueries: '/a/userinterface/uibase/vendor/procurios/elementQueries/dist/elementQueries.min',
        resizeSensor: '/a/userinterface/uibase/vendor/procurios/resizeSensor/dist/resizeSensor.min',
    };

    /**
     * @type {Object.Object}
     */
    var packages = {
        moment: {
            location: '/a/userinterface/uibase/vendor/moment',
            main: 'moment'
        },
        codemirror: {
            location: '/files/mod_editor/vendor/codemirror',
            main: 'lib/codemirror'
        }
    };

    /**
     * @param {string} normalizedModuleId
     * @param {amdModule|null} context
     * @returns {string}
     */
    function getPath (normalizedModuleId, context) {
        context = context || null;

        if (context !== null && isRelativePath(normalizedModuleId)) {
            return decorateWithExtension(resolveRelativePath(normalizedModuleId, context.getPath()));
        }

        if (isPackage(normalizedModuleId)) {
            return decorateWithExtension(getPathFromPackage(normalizedModuleId));
        }

        var nameParts = normalizedModuleId.split('/');
        var firstPart = nameParts.shift();
        if (!(firstPart in paths)) {
            // Assume its a full path to (external) file
            return normalizedModuleId;
        }

        var foundPath = paths[firstPart];
        if (nameParts.length > 0) {
            foundPath += '/' + nameParts.join('/');
        }
        return decorateWithExtension(foundPath);
    }

    /**
     * @param {string} moduleName
     * @returns {boolean}
     */
    function isRelativePath (moduleName) {
        return moduleName.match(/\.\.?\//) !== null;
    }

    /**
     * @param {string} moduleName
     * @param {string} filePath
     * @returns {string}
     */
    function resolveRelativePath (moduleName, filePath) {
        var nameParts = moduleName.split(/\/(?!\/)/);
        var filePathParts = filePath.split(/\/(?!\/)/);

        // Drop file name
        filePathParts.pop();

        var namePart;
        while (namePart = nameParts.shift()) {
            if (namePart === '.') {
                continue;
            }

            if (namePart === '..') {
                if (filePathParts.length <= 1) {
                    throw new Error('Invalid relative path');
                }
                filePathParts.pop();
                continue;
            }

            filePathParts.push(namePart);
        }

        return filePathParts.join('/');
    }

    /**
     * @param {string} moduleName
     * @returns {boolean}
     */
    function isPackage (moduleName) {
        return (
            (moduleName.indexOf('/') === -1 ? moduleName : moduleName.split('/')[0])
            in packages
        );
    }

    /**
     * @param {string} moduleName
     * @returns {string}
     */
    function getPathFromPackage (moduleName) {
        var nameParts = moduleName.split('/');
        var packageName = nameParts.shift();
        var myPackage = packages[packageName];

        return myPackage['location'] + '/' + (
            moduleName.indexOf('/') === -1
                ? myPackage['main']
                : nameParts.join('/')
        );
    }

    /**
     * @param {string} pathToDecorate
     * @returns {string}
     */
    function decorateWithExtension (pathToDecorate) {
        if (pathToDecorate.match(/\.(css|js)$/) !== null) {
            return pathToDecorate;
        }

        return pathToDecorate + '.js';
    }

    return {
        get: getPath,
        resolve: resolveRelativePath
    };
}());

module.exports = path;

},{}],9:[function(require,module,exports){
var getRegistry = (function () {
    'use strict';

    /** @type {Object} */
    var modules = {};
    /** @type {Object} */
    var listeners = {};

    /**
     * @param {string} normalizedModuleId
     * @returns {amdModule|null}
     */
    function getModule (normalizedModuleId) {
        if (!(normalizedModuleId in modules)) {
            return null;
        }

        return modules[normalizedModuleId];
    }

    /**
     * @param {amdModule} amdModule
     */
    function registerModule (amdModule) {
        if (amdModule.getId() in modules) {
            return;
        }

        modules[amdModule.getId()] = amdModule;
    }

    /**
     * @param {amdModule} targetModule
     * @param {Function} listener
     */
    function addListener (targetModule, listener) {
        if (targetModule.isDefined()) {
            listener(targetModule);
            return;
        }

        var moduleId = targetModule.getId();
        if (listeners[moduleId]) {
            listeners[moduleId].push(listener);
            return;
        }

        listeners[moduleId] = [listener];
    }

    /**
     * @param {amdModule} definedModule
     */
    function resolve (definedModule) {
        var listener;
        var activeListeners = listeners[definedModule.getId()];
        if (activeListeners) {
            while (listener = activeListeners.shift()) {
                listener(definedModule);
            }
        }
    }

    return {
        getModule: getModule,
        registerModule: registerModule,
        addListener: addListener,
        resolve: resolve
    };
}());

module.exports = getRegistry;

},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZGVmaW5lLmpzIiwic3JjL2dsb2JhbHMuanMiLCJzcmMvbG9hZGVyLmpzIiwic3JjL21hZ2ljTW9kdWxlcy5qcyIsInNyYy9tb2R1bGUuanMiLCJzcmMvbm9ybWFsaXplSWQuanMiLCJzcmMvbm9ybWFsaXplUmVzb3VyY2UuanMiLCJzcmMvcGF0aC5qcyIsInNyYy9yZWdpc3RyeS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDelFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIihmdW5jdGlvbiAoKSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgaWYgKCdkZWZpbmUnIGluIHdpbmRvdyAmJiAncmVxdWlyZScgaW4gd2luZG93KSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgRV9NQUxGT1JNRURfUkVRVUlSRSA9ICdNYWxmb3JtZWQgcmVxdWlyZSc7XG4gICAgdmFyIEVfUkVRVUlSRV9GQUlMRUQgPSAnUmVxdWlyZSBmYWlsZWQgKG1vZHVsZSBub3QgbG9hZGVkKSc7XG5cbiAgICAvKiogQHR5cGUge0Z1bmN0aW9ufSAqL1xuICAgIHZhciBub3JtYWxpemVJZCA9IHJlcXVpcmUoJy4vbm9ybWFsaXplSWQnKTtcbiAgICAvKiogQHR5cGUge0Z1bmN0aW9ufSAqL1xuICAgIHZhciBub3JtYWxpemVSZXNvdXJjZSA9IHJlcXVpcmUoJy4vbm9ybWFsaXplUmVzb3VyY2UnKTtcbiAgICAvKiogQHR5cGUge09iamVjdH0gKi9cbiAgICB2YXIgYW1kTW9kdWxlID0gcmVxdWlyZSgnLi9tb2R1bGUnKTtcbiAgICAvKiogQHR5cGUge09iamVjdH0gKi9cbiAgICB2YXIgcGF0aCA9IHJlcXVpcmUoJy4vcGF0aCcpO1xuICAgIC8qKiBAdHlwZSB7T2JqZWN0fSAqL1xuICAgIHZhciByZWdpc3RyeSA9IHJlcXVpcmUoJy4vcmVnaXN0cnknKTtcbiAgICAvKiogQHR5cGUge09iamVjdH0gKi9cbiAgICB2YXIgbWFnaWNNb2R1bGVzID0gcmVxdWlyZSgnLi9tYWdpY01vZHVsZXMnKTtcbiAgICAvKiogQHR5cGUge09iamVjdH0gKi9cbiAgICB2YXIgbG9hZGVyID0gcmVxdWlyZSgnLi9sb2FkZXInKTtcbiAgICAvKiogQHR5cGUge09iamVjdH0gKi9cbiAgICB2YXIgZ2xvYmFscyA9IHJlcXVpcmUoJy4vZ2xvYmFscycpO1xuXG4gICAgLyoqIEB0eXBlIHtPYmplY3R9ICovXG4gICAgdmFyIGRlZmluZVF1ZXVlID0ge307XG4gICAgLyoqIEB0eXBlIHtPYmplY3R9ICovXG4gICAgdmFyIGRlZmluZUhpc3RvcnkgPSB7fTtcblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfEFycmF5fEZ1bmN0aW9ufSBtb2R1bGVJZFxuICAgICAqIEBwYXJhbSB7QXJyYXl8RnVuY3Rpb259IGRlcGVuZGVuY2llc1xuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluaXRpb25cbiAgICAgKi9cbiAgICB3aW5kb3cuZGVmaW5lID0gZnVuY3Rpb24gKG1vZHVsZUlkLCBkZXBlbmRlbmNpZXMsIGRlZmluaXRpb24pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBtb2R1bGVJZCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGRlZmluaXRpb24gPSBkZXBlbmRlbmNpZXM7XG4gICAgICAgICAgICBkZXBlbmRlbmNpZXMgPSBtb2R1bGVJZDtcbiAgICAgICAgICAgIG1vZHVsZUlkID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZGVwZW5kZW5jaWVzIHx8ICEoZGVwZW5kZW5jaWVzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICBkZWZpbml0aW9uID0gZGVwZW5kZW5jaWVzO1xuICAgICAgICAgICAgZGVwZW5kZW5jaWVzID0gW107XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobW9kdWxlSWQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIGlmIChsb2FkZXIudXNlSW50ZXJhY3RpdmUoKSkge1xuICAgICAgICAgICAgICAgIG1vZHVsZUlkID0gbG9hZGVyLmdldElkT2ZDdXJyZW50bHlFeGVjdXRpbmdNb2R1bGUoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZGVmaW5lUXVldWVbbW9kdWxlSWQgfHwgJ2xhc3QnXSA9IFttb2R1bGVJZCwgZGVwZW5kZW5jaWVzLCBkZWZpbml0aW9uXTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIG1vZHVsZUlkID0gbm9ybWFsaXplSWQobW9kdWxlSWQpO1xuICAgICAgICBkZWZpbmVIaXN0b3J5W21vZHVsZUlkXSA9IHRydWU7XG4gICAgICAgIHZhciBtb2R1bGVUb0RlZmluZSA9IHJlZ2lzdHJ5LmdldE1vZHVsZShtb2R1bGVJZCkgfHwgYW1kTW9kdWxlLmNyZWF0ZShtb2R1bGVJZCwgcGF0aC5nZXQobW9kdWxlSWQpKTtcbiAgICAgICAgcmVnaXN0cnkucmVnaXN0ZXJNb2R1bGUobW9kdWxlVG9EZWZpbmUpO1xuXG4gICAgICAgIGlmIChkZXBlbmRlbmNpZXMubGVuZ3RoIDwgMSkge1xuICAgICAgICAgICAgZGVmaW5pdGlvbiAmJiBtb2R1bGVUb0RlZmluZS5zZXRWYWx1ZShcbiAgICAgICAgICAgICAgICB0eXBlb2YgZGVmaW5pdGlvbiA9PT0gJ2Z1bmN0aW9uJyA/IGRlZmluaXRpb24oKSA6IGRlZmluaXRpb25cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZWdpc3RyeS5yZXNvbHZlKG1vZHVsZVRvRGVmaW5lKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHF1ZXVlRGVwZW5kZW5jaWVzKGRlcGVuZGVuY2llcywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZGVmaW5pdGlvbiAmJiBtb2R1bGVUb0RlZmluZS5zZXRWYWx1ZShkZWZpbml0aW9uLmFwcGx5KG51bGwsIGFyZ3VtZW50cykpO1xuICAgICAgICAgICAgcmVnaXN0cnkucmVzb2x2ZShtb2R1bGVUb0RlZmluZSk7XG4gICAgICAgIH0sIG1vZHVsZVRvRGVmaW5lKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtBcnJheXxzdHJpbmd8RnVuY3Rpb259IGRlcGVuZGVuY2llc1xuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluaXRpb25cbiAgICAgKiBAcGFyYW0ge2FtZE1vZHVsZX0gY29udGV4dFxuICAgICAqIEByZXR1cm5zIHsqfVxuICAgICAqL1xuICAgIHdpbmRvdy5yZXF1aXJlID0gZnVuY3Rpb24gKGRlcGVuZGVuY2llcywgZGVmaW5pdGlvbiwgY29udGV4dCkge1xuICAgICAgICBpZiAoIWRlcGVuZGVuY2llcyAmJiAhZGVmaW5pdGlvbikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKEVfTUFMRk9STUVEX1JFUVVJUkUpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRlcGVuZGVuY2llcyBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICBxdWV1ZURlcGVuZGVuY2llcyhkZXBlbmRlbmNpZXMsIGRlZmluaXRpb24sIGNvbnRleHQpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBkZXBlbmRlbmNpZXMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB2YXIgbW9kdWxlSWQgPSBub3JtYWxpemVJZChkZXBlbmRlbmNpZXMpO1xuICAgICAgICAgICAgdmFyIGxvYWRlZE1vZHVsZSA9IHJlZ2lzdHJ5LmdldE1vZHVsZShtb2R1bGVJZCk7XG5cbiAgICAgICAgICAgIGlmICghbG9hZGVkTW9kdWxlIHx8ICFsb2FkZWRNb2R1bGUuaXNEZWZpbmVkKCkpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoRV9SRVFVSVJFX0ZBSUxFRCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBsb2FkZWRNb2R1bGUuZ2V0VmFsdWUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2YgZGVwZW5kZW5jaWVzID09PSAnZnVuY3Rpb24nICYmICFkZWZpbml0aW9uKSB7XG4gICAgICAgICAgICBkZXBlbmRlbmNpZXMoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihFX01BTEZPUk1FRF9SRVFVSVJFKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG1vZHVsZUlkXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG1vZHVsZVBhdGhcbiAgICAgKiBAcmV0dXJucyB7YW1kTW9kdWxlfVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNyZWF0ZUFuZExvYWRNb2R1bGUgKG1vZHVsZUlkLCBtb2R1bGVQYXRoKSB7XG4gICAgICAgIGlmIChyZWdpc3RyeS5nZXRNb2R1bGUobW9kdWxlSWQpKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVnaXN0cnkuZ2V0TW9kdWxlKG1vZHVsZUlkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBuZXdNb2R1bGUgPSBhbWRNb2R1bGUuY3JlYXRlKG1vZHVsZUlkLCBtb2R1bGVQYXRoKTtcbiAgICAgICAgcmVnaXN0cnkucmVnaXN0ZXJNb2R1bGUobmV3TW9kdWxlKTtcblxuICAgICAgICBpZiAoIW5ld01vZHVsZS5pc0RlZmluZWQoKSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBsb2FkZXIubG9hZChuZXdNb2R1bGUsIGZpbmlzaERlZmluaW5nKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3TW9kdWxlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ld01vZHVsZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbG9hZGVkTW9kdWxlSWRcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBmaW5pc2hEZWZpbmluZyAobG9hZGVkTW9kdWxlSWQpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgIShsb2FkZWRNb2R1bGVJZCBpbiBkZWZpbmVRdWV1ZSlcbiAgICAgICAgICAgICYmICEoJ2xhc3QnIGluIGRlZmluZVF1ZXVlKVxuICAgICAgICAgICAgJiYgIWdsb2JhbHMuaXNHbG9iYWwobG9hZGVkTW9kdWxlSWQpXG4gICAgICAgICAgICAmJiAhKGxvYWRlZE1vZHVsZUlkIGluIGRlZmluZUhpc3RvcnkpXG4gICAgICAgICkge1xuICAgICAgICAgICAgdmFyIGxvYWRlZE1vZHVsZSA9IHJlZ2lzdHJ5LmdldE1vZHVsZShsb2FkZWRNb2R1bGVJZCk7XG4gICAgICAgICAgICBsb2FkZWRNb2R1bGUgJiYgbG9hZGVkTW9kdWxlLnNldERlZmluZWQoKSAmJiByZWdpc3RyeS5yZXNvbHZlKGxvYWRlZE1vZHVsZSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZGVmaW5lQXJndW1lbnRzID0gbnVsbDtcblxuICAgICAgICBpZiAobG9hZGVyLnVzZUludGVyYWN0aXZlKCkgJiYgbG9hZGVkTW9kdWxlSWQgaW4gZGVmaW5lUXVldWUpIHtcbiAgICAgICAgICAgIGRlZmluZUFyZ3VtZW50cyA9IGRlZmluZVF1ZXVlW2xvYWRlZE1vZHVsZUlkXTtcbiAgICAgICAgICAgIGRlbGV0ZSBkZWZpbmVRdWV1ZVtsb2FkZWRNb2R1bGVJZF07XG4gICAgICAgIH0gZWxzZSBpZiAoIWxvYWRlci51c2VJbnRlcmFjdGl2ZSgpKSB7XG4gICAgICAgICAgICBkZWZpbmVBcmd1bWVudHMgPSBkZWZpbmVRdWV1ZVsnbGFzdCddIHx8IFtdO1xuICAgICAgICAgICAgZGVmaW5lQXJndW1lbnRzWzBdID0gbG9hZGVkTW9kdWxlSWQ7XG4gICAgICAgICAgICBkZWxldGUgZGVmaW5lUXVldWVbJ2xhc3QnXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZGVmaW5lQXJndW1lbnRzKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZ2xvYmFscy5pc0dsb2JhbChsb2FkZWRNb2R1bGVJZCkgJiYgZGVmaW5lQXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgaWYgKGxvYWRlZE1vZHVsZUlkIGluIGRlZmluZUhpc3RvcnkpIHtcbiAgICAgICAgICAgICAgICAvLyBHbG9iYWwgaXMgYXBwYXJlbnRseSB1c2luZyBBTUQgdG8gcmVnaXN0ZXIgaXRzZWxmXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBkZWZpbmVBcmd1bWVudHNbMV0gPSBbXTtcbiAgICAgICAgICAgIGRlZmluZUFyZ3VtZW50c1syXSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIGdsb2JhbHMuZ2V0KGxvYWRlZE1vZHVsZUlkKTsgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHdpbmRvdy5kZWZpbmUuYXBwbHkobnVsbCwgZGVmaW5lQXJndW1lbnRzKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBxdWV1ZURlcGVuZGVuY2llcyAoKSB7XG4gICAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuXG4gICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGxvYWREZXBlbmRlbmNpZXMuYXBwbHkobnVsbCwgYXJncyk7XG4gICAgICAgIH0sIDQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IGRlcGVuZGVuY2llc1xuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluaXRpb25cbiAgICAgKiBAcGFyYW0ge2FtZE1vZHVsZX0gY29udGV4dFxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGxvYWREZXBlbmRlbmNpZXMgKGRlcGVuZGVuY2llcywgZGVmaW5pdGlvbiwgY29udGV4dCkge1xuICAgICAgICB2YXIgdmFsdWVzID0gW107XG4gICAgICAgIHZhciBsb2FkZWQgPSAwO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcGFyYW0ge2FtZE1vZHVsZX0gbG9hZGVkTW9kdWxlXG4gICAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSByZXNvdXJjZVxuICAgICAgICAgKi9cbiAgICAgICAgZnVuY3Rpb24gZGVwZW5kZW5jeUxvYWRlZCAobG9hZGVkTW9kdWxlLCByZXNvdXJjZSkge1xuICAgICAgICAgICAgaWYgKHJlc291cmNlKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1vZHVsZVZhbHVlID0gbG9hZGVkTW9kdWxlLmdldFZhbHVlKCk7XG4gICAgICAgICAgICAgICAgbW9kdWxlVmFsdWUubG9hZChyZXNvdXJjZSwgZnVuY3Rpb24gKGxvYWRlZFZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIGFwcGx5RGVwZW5kZW5jeVZhbHVlKGxvYWRlZE1vZHVsZS5nZXRJZCgpICsgJyEnICsgcmVzb3VyY2UsIGxvYWRlZFZhbHVlIHx8IG1vZHVsZVZhbHVlKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGFwcGx5RGVwZW5kZW5jeVZhbHVlKGxvYWRlZE1vZHVsZS5nZXRJZCgpLCBsb2FkZWRNb2R1bGUuZ2V0VmFsdWUoKSk7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogQHBhcmFtIHtzdHJpbmd9IG1vZHVsZVJlc291cmNlSWRcbiAgICAgICAgICogQHBhcmFtIHsqfSBtb2R1bGVWYWx1ZVxuICAgICAgICAgKi9cbiAgICAgICAgZnVuY3Rpb24gYXBwbHlEZXBlbmRlbmN5VmFsdWUgKG1vZHVsZVJlc291cmNlSWQsIG1vZHVsZVZhbHVlKSB7XG4gICAgICAgICAgICB2YWx1ZXNbZGVwZW5kZW5jaWVzLmluZGV4T2YobW9kdWxlUmVzb3VyY2VJZCldID0gbW9kdWxlVmFsdWU7XG5cbiAgICAgICAgICAgIGlmIChkZWZpbml0aW9uICYmICsrbG9hZGVkID49IGRlcGVuZGVuY2llcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBkZWZpbml0aW9uLmFwcGx5KG51bGwsIHZhbHVlcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogQHBhcmFtIHtzdHJpbmd9IG1vZHVsZUlkXG4gICAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSByZXNvdXJjZVxuICAgICAgICAgKi9cbiAgICAgICAgZnVuY3Rpb24gbG9hZERlcGVuZGVuY3kgKG1vZHVsZUlkLCByZXNvdXJjZSkge1xuICAgICAgICAgICAgdmFyIG1vZHVsZVRvTG9hZDtcblxuICAgICAgICAgICAgc3dpdGNoIChtb2R1bGVJZCkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ3JlcXVpcmUnOlxuICAgICAgICAgICAgICAgICAgICBtb2R1bGVUb0xvYWQgPSBtYWdpY01vZHVsZXMuZ2V0TG9jYWxSZXF1aXJlKGNvbnRleHQpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdleHBvcnRzJzpcbiAgICAgICAgICAgICAgICAgICAgbW9kdWxlVG9Mb2FkID0gbWFnaWNNb2R1bGVzLmdldEV4cG9ydHMoY29udGV4dCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ21vZHVsZSc6XG4gICAgICAgICAgICAgICAgICAgIG1vZHVsZVRvTG9hZCA9IG1hZ2ljTW9kdWxlcy5nZXRNb2R1bGUoY29udGV4dCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIG1vZHVsZVRvTG9hZCA9IHJlZ2lzdHJ5LmdldE1vZHVsZShtb2R1bGVJZCkgfHwgY3JlYXRlQW5kTG9hZE1vZHVsZShtb2R1bGVJZCwgcGF0aC5nZXQobW9kdWxlSWQsIGNvbnRleHQpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVnaXN0cnkuYWRkTGlzdGVuZXIobW9kdWxlVG9Mb2FkLCBmdW5jdGlvbiAobG9hZGVkTW9kdWxlKSB7XG4gICAgICAgICAgICAgICAgZGVwZW5kZW5jeUxvYWRlZChsb2FkZWRNb2R1bGUsIHJlc291cmNlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkZXBlbmRlbmNpZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBtb2R1bGVJZCA9IG5vcm1hbGl6ZUlkKGRlcGVuZGVuY2llc1tpXSwgY29udGV4dCk7XG4gICAgICAgICAgICB2YXIgcmVzb3VyY2UgPSBub3JtYWxpemVSZXNvdXJjZShkZXBlbmRlbmNpZXNbaV0sIGNvbnRleHQpO1xuICAgICAgICAgICAgZGVwZW5kZW5jaWVzW2ldID0gKHJlc291cmNlKSA/IG1vZHVsZUlkICsgJyEnICsgcmVzb3VyY2UgOiBtb2R1bGVJZDtcbiAgICAgICAgICAgIGxvYWREZXBlbmRlbmN5KG1vZHVsZUlkLCByZXNvdXJjZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7e2pRdWVyeTogYm9vbGVhbn19XG4gICAgICovXG4gICAgd2luZG93LmRlZmluZS5hbWQgPSB7XG4gICAgICAgIGpRdWVyeTogdHJ1ZVxuICAgIH07XG59KSgpO1xuIiwidmFyIGdldEdsb2JhbHMgPSAoZnVuY3Rpb24gKGdsb2JhbCkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8qKiBAdHlwZSB7T2JqZWN0fSAqL1xuICAgIHZhciBnbG9iYWxzID0ge1xuICAgICAgICAncGIvcGJsaWInOiB7XG4gICAgICAgICAgICBuYW1lOiAnUGJMaWInLFxuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgaWYgKCEoJ1BiTGliJyBpbiBnbG9iYWwpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBnbG9iYWxbJ1BiTGliJ107XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHByb3RvdHlwZToge1xuICAgICAgICAgICAgbmFtZTogJ1Byb3RvdHlwZScsXG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBpZiAoISgnUHJvdG90eXBlJyBpbiBnbG9iYWwpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBnbG9iYWxbJyQnXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgdGlueW1jZTQ6IHtcbiAgICAgICAgICAgIG5hbWU6ICdUaW55TUNFJyxcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmICghKCd0aW55bWNlJyBpbiBnbG9iYWwpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBnbG9iYWxbJ3RpbnltY2UnXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgZWxlbWVudFF1ZXJpZXM6IHtcbiAgICAgICAgICAgIG5hbWU6ICdlbGVtZW50UXVlcmllcycsXG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBpZiAoISgnZWxlbWVudFF1ZXJpZXMnIGluIGdsb2JhbCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGdsb2JhbFsnZWxlbWVudFF1ZXJpZXMnXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcmVzaXplU2Vuc29yOiB7XG4gICAgICAgICAgICBuYW1lOiAncmVzaXplU2Vuc29yJyxcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmICghKCdyZXNpemVTZW5zb3InIGluIGdsb2JhbCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGdsb2JhbFsncmVzaXplU2Vuc29yJ107XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG1vZHVsZUlkXG4gICAgICogQHJldHVybnMgeyp9XG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0IChtb2R1bGVJZCkge1xuICAgICAgICByZXR1cm4gZ2xvYmFsc1ttb2R1bGVJZF0uZ2V0KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG1vZHVsZUlkXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAgICovXG4gICAgZnVuY3Rpb24gaXNHbG9iYWwgKG1vZHVsZUlkKSB7XG4gICAgICAgIHJldHVybiAobW9kdWxlSWQgaW4gZ2xvYmFscyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG1vZHVsZUlkXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAgICovXG4gICAgZnVuY3Rpb24gaXNMb2FkZWQgKG1vZHVsZUlkKSB7XG4gICAgICAgIHJldHVybiBpc0dsb2JhbChtb2R1bGVJZCkgJiYgZ2xvYmFsc1ttb2R1bGVJZF0uZ2V0KCkgIT09IG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgaXNHbG9iYWw6IGlzR2xvYmFsLFxuICAgICAgICBpc0xvYWRlZDogaXNMb2FkZWQsXG4gICAgICAgIGdldDogZ2V0XG4gICAgfTtcbn0pKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnID8gd2luZG93IDogdGhpcyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZ2V0R2xvYmFscztcbiIsInZhciBnZXRMb2FkZXIgPSAoZnVuY3Rpb24gKGdsb2JhbCkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8qKiBAdHlwZSB7c3RyaW5nfSAqL1xuICAgIHZhciBFX0lOVkFMSURfUEFUSCA9ICdVbmFibGUgdG8gbG9hZCBtb2R1bGU6IGludmFsaWQgcGF0aCc7XG5cbiAgICAvKiogQHR5cGUge2Jvb2xlYW59ICovXG4gICAgdmFyIGlzT3BlcmEgPSB0eXBlb2Ygb3BlcmEgIT09ICd1bmRlZmluZWQnICYmIG9wZXJhLnRvU3RyaW5nKCkgPT09ICdbb2JqZWN0IE9wZXJhXSc7XG4gICAgLyoqIEB0eXBlIHtib29sZWFufSAqL1xuICAgIHZhciB1c2VJbnRlcmFjdGl2ZSA9IGZhbHNlO1xuICAgIC8qKiBAdHlwZSB7RWxlbWVudH0gKi9cbiAgICB2YXIgY3VycmVudGx5QWRkaW5nU2NyaXB0O1xuICAgIC8qKiBAdHlwZSB7RWxlbWVudH0gKi9cbiAgICB2YXIgaW50ZXJhY3RpdmVTY3JpcHQ7XG5cbiAgICAvKiogQHR5cGUge05vZGV9ICovXG4gICAgdmFyIGJhc2VFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2Jhc2UnKVswXTtcbiAgICAvKiogQHR5cGUge05vZGV9ICovXG4gICAgdmFyIGhlYWQgPSBiYXNlRWxlbWVudCA/IGJhc2VFbGVtZW50LnBhcmVudE5vZGUgOiBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaGVhZCcpWzBdO1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHthbWRNb2R1bGV9IGFtZE1vZHVsZVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluZUNhbGxiYWNrXG4gICAgICovXG4gICAgZnVuY3Rpb24gbG9hZCAoYW1kTW9kdWxlLCBkZWZpbmVDYWxsYmFjaykge1xuICAgICAgICBpZiAoYW1kTW9kdWxlLmdldFBhdGgoKS5tYXRjaCgvKF4oXFwuezAsMn1cXC98KD86W2Etel0rOik/XFwvXFwvKXxcXC5qcykvKSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKEVfSU5WQUxJRF9QQVRIKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzY3JpcHQgPSBnZXRTY3JpcHRFbGVtZW50KGFtZE1vZHVsZSk7XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgc2NyaXB0LmF0dGFjaEV2ZW50XG4gICAgICAgICAgICAmJiAhKHNjcmlwdC5hdHRhY2hFdmVudC50b1N0cmluZyAmJiBzY3JpcHQuYXR0YWNoRXZlbnQudG9TdHJpbmcoKS5pbmRleE9mKCdbbmF0aXZlIGNvZGUnKSA8IDApXG4gICAgICAgICAgICAmJiAhaXNPcGVyYVxuICAgICAgICApIHtcbiAgICAgICAgICAgIHVzZUludGVyYWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgIHNjcmlwdC5hdHRhY2hFdmVudCgnb25yZWFkeXN0YXRlY2hhbmdlJywgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICAgICAgb25TY3JpcHRMb2FkKHNjcmlwdCwgZXZlbnQsIGRlZmluZUNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2NyaXB0LmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgICAgICBvblNjcmlwdExvYWQoc2NyaXB0LCBldmVudCwgZGVmaW5lQ2FsbGJhY2spO1xuICAgICAgICAgICAgfSwgZmFsc2UpO1xuICAgICAgICAgICAgc2NyaXB0LmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmICghKCdjb25zb2xlJyBpbiBnbG9iYWwpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBnbG9iYWxbJ2NvbnNvbGUnXS5lcnJvcignYGFtZExvYWRlcmA6IExvYWRpbmcgbW9kdWxlIGAnICsgYW1kTW9kdWxlLmdldElkKCkgKyAnYCBmYWlsZWQsIHVzaW5nIHNjcmlwdCB3aXRoIHVybCAnICsgYW1kTW9kdWxlLmdldFBhdGgoKSk7XG4gICAgICAgICAgICB9LCBmYWxzZSk7XG4gICAgICAgIH1cblxuICAgICAgICBzY3JpcHQuc3JjID0gYW1kTW9kdWxlLmdldFBhdGgoKTtcblxuICAgICAgICAvLyBub2luc3BlY3Rpb24gSlNVbnVzZWRBc3NpZ25tZW50IGN1cnJlbnRseUFkZGluZ1NjcmlwdCBpcyB1c2VkIGluIGdldEludGVyYWN0aXZlU2NyaXB0XG4gICAgICAgIGN1cnJlbnRseUFkZGluZ1NjcmlwdCA9IHNjcmlwdDtcblxuICAgICAgICBoZWFkLmluc2VydEJlZm9yZShzY3JpcHQsIGJhc2VFbGVtZW50IHx8IG51bGwpO1xuXG4gICAgICAgIGN1cnJlbnRseUFkZGluZ1NjcmlwdCA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtIVE1MRWxlbWVudH0gc2NyaXB0XG4gICAgICogQHBhcmFtIHtFdmVudH0gZXZlbnRcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBkZWZpbmVDYWxsYmFja1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIG9uU2NyaXB0TG9hZCAoc2NyaXB0LCBldmVudCwgZGVmaW5lQ2FsbGJhY2spIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXZlbnQudHlwZSA9PT0gJ2xvYWQnXG4gICAgICAgICAgICB8fCAoL14oY29tcGxldGV8bG9hZGVkKSQvLnRlc3QoKGV2ZW50LmN1cnJlbnRUYXJnZXQgfHwgZXZlbnQuc3JjRWxlbWVudCkucmVhZHlTdGF0ZSkpXG4gICAgICAgICkge1xuICAgICAgICAgICAgaW50ZXJhY3RpdmVTY3JpcHQgPSBudWxsO1xuICAgICAgICAgICAgZGVmaW5lQ2FsbGJhY2soc2NyaXB0LmdldEF0dHJpYnV0ZSgnZGF0YS1tb2R1bGVJZCcpKTtcbiAgICAgICAgICAgIHNjcmlwdC5yZW1vdmVBdHRyaWJ1dGUoJ2RhdGEtbW9kdWxlSWQnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7YW1kTW9kdWxlfSBhbWRNb2R1bGVcbiAgICAgKiBAcmV0dXJucyB7RWxlbWVudH1cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRTY3JpcHRFbGVtZW50IChhbWRNb2R1bGUpIHtcbiAgICAgICAgdmFyIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuICAgICAgICBzY3JpcHQuYXN5bmMgPSB0cnVlO1xuICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKCdkYXRhLW1vZHVsZUlkJywgYW1kTW9kdWxlLmdldElkKCkpO1xuICAgICAgICByZXR1cm4gc2NyaXB0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm5zIHtFbGVtZW50fVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldEludGVyYWN0aXZlU2NyaXB0ICgpIHtcbiAgICAgICAgaWYgKGN1cnJlbnRseUFkZGluZ1NjcmlwdCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnRseUFkZGluZ1NjcmlwdDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpbnRlcmFjdGl2ZVNjcmlwdCAmJiBpbnRlcmFjdGl2ZVNjcmlwdC5yZWFkeVN0YXRlID09PSAnaW50ZXJhY3RpdmUnKSB7XG4gICAgICAgICAgICByZXR1cm4gaW50ZXJhY3RpdmVTY3JpcHQ7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc2NyaXB0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKTtcbiAgICAgICAgdmFyIGwgPSBzY3JpcHRzLmxlbmd0aDtcblxuICAgICAgICB3aGlsZSAobC0tKSB7XG4gICAgICAgICAgICB2YXIgc2NyaXB0ID0gc2NyaXB0c1tsXTtcblxuICAgICAgICAgICAgaWYgKHNjcmlwdC5yZWFkeVN0YXRlID09PSAnaW50ZXJhY3RpdmUnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIChpbnRlcmFjdGl2ZVNjcmlwdCA9IHNjcmlwdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfG51bGx9XG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0SWRPZkN1cnJlbnRseUV4ZWN1dGluZ01vZHVsZSAoKSB7XG4gICAgICAgIHZhciBzY3JpcHQgPSBnZXRJbnRlcmFjdGl2ZVNjcmlwdCgpO1xuXG4gICAgICAgIGlmICghc2NyaXB0KSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzY3JpcHQuZ2V0QXR0cmlidXRlKCdkYXRhLW1vZHVsZUlkJykgfHwgbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBsb2FkOiBsb2FkLFxuICAgICAgICB1c2VJbnRlcmFjdGl2ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHVzZUludGVyYWN0aXZlO1xuICAgICAgICB9LFxuICAgICAgICBnZXRJZE9mQ3VycmVudGx5RXhlY3V0aW5nTW9kdWxlOiBnZXRJZE9mQ3VycmVudGx5RXhlY3V0aW5nTW9kdWxlXG4gICAgfTtcbn0pKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnID8gd2luZG93IDogdGhpcyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZ2V0TG9hZGVyO1xuIiwidmFyIGRlZmF1bHRNb2R1bGVzID0gKGZ1bmN0aW9uICgpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvKiogQHR5cGUge0Z1bmN0aW9ufSAqL1xuICAgIHZhciBub3JtYWxpemVJZCA9IHJlcXVpcmUoJy4vbm9ybWFsaXplSWQnKTtcbiAgICAvKiogQHR5cGUge09iamVjdH0gKi9cbiAgICB2YXIgcGF0aCA9IHJlcXVpcmUoJy4vcGF0aCcpO1xuICAgIC8qKiBAdHlwZSB7T2JqZWN0fSAqL1xuICAgIHZhciBhbWRNb2R1bGUgPSByZXF1aXJlKCcuL21vZHVsZScpO1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHthbWRNb2R1bGV9IGNvbnRleHRcbiAgICAgKiBAcmV0dXJucyB7YW1kTW9kdWxlfVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldExvY2FsUmVxdWlyZSAoY29udGV4dCkge1xuICAgICAgICBmdW5jdGlvbiBsb2NhbFJlcXVpcmUgKCkge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgICAgICBhcmdzWzJdID0gY29udGV4dCB8fCBudWxsO1xuICAgICAgICAgICAgcmV0dXJuIHdpbmRvdy5yZXF1aXJlLmFwcGx5KHdpbmRvdywgYXJncyk7XG4gICAgICAgIH1cblxuICAgICAgICBsb2NhbFJlcXVpcmVbJ3RvVXJsJ10gPSBmdW5jdGlvbiAobW9kdWxlSWQpIHtcbiAgICAgICAgICAgIHJldHVybiBwYXRoLmdldChub3JtYWxpemVJZChtb2R1bGVJZCksIGNvbnRleHQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBhbWRNb2R1bGUuY3JlYXRlKCdyZXF1aXJlJykuc2V0VmFsdWUobG9jYWxSZXF1aXJlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge2FtZE1vZHVsZX0gY29udGV4dFxuICAgICAqIEByZXR1cm5zIHthbWRNb2R1bGV9XG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0RXhwb3J0cyAoY29udGV4dCkge1xuICAgICAgICB2YXIgZXhwb3J0cyA9IGFtZE1vZHVsZS5jcmVhdGUoJ2V4cG9ydHMnKTtcbiAgICAgICAgZXhwb3J0cy5zZXRWYWx1ZShjb250ZXh0LmdldFZhbHVlKCkpO1xuICAgICAgICByZXR1cm4gZXhwb3J0cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge2FtZE1vZHVsZX0gY29udGV4dFxuICAgICAqIEByZXR1cm5zIHthbWRNb2R1bGV9XG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0TW9kdWxlIChjb250ZXh0KSB7XG4gICAgICAgIHJldHVybiBhbWRNb2R1bGUuY3JlYXRlKCdtb2R1bGUnKS5zZXRWYWx1ZSh7XG4gICAgICAgICAgICBpZDogY29udGV4dC5nZXRJZCgpLFxuICAgICAgICAgICAgdXJpOiBjb250ZXh0LmdldFBhdGgoKVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZXRMb2NhbFJlcXVpcmU6IGdldExvY2FsUmVxdWlyZSxcbiAgICAgICAgZ2V0RXhwb3J0czogZ2V0RXhwb3J0cyxcbiAgICAgICAgZ2V0TW9kdWxlOiBnZXRNb2R1bGVcbiAgICB9O1xufSgpKTtcblxubW9kdWxlLmV4cG9ydHMgPSBkZWZhdWx0TW9kdWxlcztcbiIsInZhciBtb2R1bGVGYWN0b3J5ID0gKGZ1bmN0aW9uICgpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvKiogQHR5cGUge09iamVjdH0gKi9cbiAgICB2YXIgZ2xvYmFscyA9IHJlcXVpcmUoJy4vZ2xvYmFscycpO1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5vcm1hbGl6ZWRJZFxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBwYXRoXG4gICAgICovXG4gICAgZnVuY3Rpb24gYW1kTW9kdWxlIChub3JtYWxpemVkSWQsIHBhdGgpIHtcbiAgICAgICAgdGhpcy5pZCA9IG5vcm1hbGl6ZWRJZDtcbiAgICAgICAgdGhpcy5wYXRoID0gcGF0aCB8fCBudWxsO1xuICAgICAgICB0aGlzLnZhbHVlID0gbnVsbDtcbiAgICAgICAgdGhpcy5leHBvcnRzID0ge307XG4gICAgICAgIHRoaXMuZGVmaW5lZCA9IGZhbHNlO1xuXG4gICAgICAgIGlmIChnbG9iYWxzLmlzR2xvYmFsKG5vcm1hbGl6ZWRJZCkgJiYgZ2xvYmFscy5pc0xvYWRlZChub3JtYWxpemVkSWQpKSB7XG4gICAgICAgICAgICB0aGlzLnNldFZhbHVlKGdsb2JhbHMuZ2V0KG5vcm1hbGl6ZWRJZCkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAgKi9cbiAgICBhbWRNb2R1bGUucHJvdG90eXBlLmdldElkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5pZDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAgKi9cbiAgICBhbWRNb2R1bGUucHJvdG90eXBlLmdldFBhdGggPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnBhdGg7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcmV0dXJucyB7YW1kTW9kdWxlfVxuICAgICAqL1xuICAgIGFtZE1vZHVsZS5wcm90b3R5cGUuc2V0VmFsdWUgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgdGhpcy52YWx1ZSA9IHZhbHVlO1xuICAgICAgICB0aGlzLmRlZmluZWQgPSB0cnVlO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQHJldHVybnMgeyp8bnVsbH1cbiAgICAgKi9cbiAgICBhbWRNb2R1bGUucHJvdG90eXBlLmdldFZhbHVlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy52YWx1ZSB8fCB0aGlzLmV4cG9ydHM7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufVxuICAgICAqL1xuICAgIGFtZE1vZHVsZS5wcm90b3R5cGUuaXNEZWZpbmVkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5kZWZpbmVkO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7YW1kTW9kdWxlfVxuICAgICAqL1xuICAgIGFtZE1vZHVsZS5wcm90b3R5cGUuc2V0RGVmaW5lZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5kZWZpbmVkID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcGFyYW0ge3N0cmluZ30gaWRcbiAgICAgICAgICogQHBhcmFtIHtzdHJpbmd9IHBhdGhcbiAgICAgICAgICogQHJldHVybnMge2FtZE1vZHVsZX1cbiAgICAgICAgICovXG4gICAgICAgIGNyZWF0ZTogZnVuY3Rpb24gKGlkLCBwYXRoKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IGFtZE1vZHVsZShpZCwgcGF0aCk7XG4gICAgICAgIH1cbiAgICB9O1xufSgpKTtcblxubW9kdWxlLmV4cG9ydHMgPSBtb2R1bGVGYWN0b3J5O1xuIiwidmFyIGdldE5vcm1hbGl6ZUlkID0gKGZ1bmN0aW9uICgpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvKiogQHR5cGUge09iamVjdH0gKi9cbiAgICB2YXIgcGF0aCA9IHJlcXVpcmUoJy4vcGF0aCcpO1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG1vZHVsZVJlc291cmNlSWRcbiAgICAgKiBAcGFyYW0ge2FtZE1vZHVsZX0gY29udGV4dFxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgICovXG4gICAgcmV0dXJuIGZ1bmN0aW9uIChtb2R1bGVSZXNvdXJjZUlkLCBjb250ZXh0KSB7XG4gICAgICAgIHZhciBtb2R1bGVJZCA9IG1vZHVsZVJlc291cmNlSWQuaW5kZXhPZignIScpIDwgMCA/IG1vZHVsZVJlc291cmNlSWQgOiBtb2R1bGVSZXNvdXJjZUlkLnNwbGl0KCchJylbMF07XG5cbiAgICAgICAgaWYgKCFjb250ZXh0IHx8IG1vZHVsZUlkLmluZGV4T2YoJy4vJykgPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gbW9kdWxlSWQ7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcGF0aC5yZXNvbHZlKG1vZHVsZUlkLCBjb250ZXh0LmdldElkKCkpO1xuICAgIH07XG59KSgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGdldE5vcm1hbGl6ZUlkO1xuIiwidmFyIGdldE5vcm1hbGl6ZVJlc291cmNlID0gKGZ1bmN0aW9uICgpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvKiogQHR5cGUge09iamVjdH0gKi9cbiAgICB2YXIgcGF0aCA9IHJlcXVpcmUoJy4vcGF0aCcpO1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG1vZHVsZVJlc291cmNlSWRcbiAgICAgKiBAcGFyYW0ge2FtZE1vZHVsZX0gY29udGV4dFxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd8bnVsbH1cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBub3JtYWxpemVSZXNvdXJjZSAobW9kdWxlUmVzb3VyY2VJZCwgY29udGV4dCkge1xuICAgICAgICBpZiAoIW1vZHVsZVJlc291cmNlSWQgfHwgbW9kdWxlUmVzb3VyY2VJZC5pbmRleE9mKCchJykgPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByZXNvdXJjZVBhcnRzID0gbW9kdWxlUmVzb3VyY2VJZC5zcGxpdCgnIScpO1xuXG4gICAgICAgIGlmIChyZXNvdXJjZVBhcnRzWzFdLmluZGV4T2YoJy4vJykgPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzb3VyY2VQYXJ0c1sxXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwYXRoLmdldChyZXNvdXJjZVBhcnRzWzFdLCBjb250ZXh0KTtcbiAgICB9XG5cbiAgICByZXR1cm4gbm9ybWFsaXplUmVzb3VyY2U7XG59KSgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGdldE5vcm1hbGl6ZVJlc291cmNlO1xuIiwidmFyIHBhdGggPSAoZnVuY3Rpb24gKCkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtPYmplY3Quc3RyaW5nfVxuICAgICAqL1xuICAgIHZhciBwYXRocyA9IHtcbiAgICAgICAgcGI6ICcvYS91c2VyaW50ZXJmYWNlL3VpYmFzZS9zY3JpcHQvcGJsaWInLFxuICAgICAgICBwcm90b3R5cGU6ICcvYS91c2VyaW50ZXJmYWNlL3VpYmFzZS9zY3JpcHQvcHJvdG90eXBlL3Byb3RvdHlwZScsXG4gICAgICAgIG9sZENvbXBvbmVudDogJy9hL3VzZXJpbnRlcmZhY2UvdWliYXNlL2NvbXBvbmVudHMnLFxuICAgICAgICBkb21SZWFkeTogJy9hL3VzZXJpbnRlcmZhY2UvdWliYXNlL3ZlbmRvci9kb21yZWFkeS9yZWFkeS5taW4nLFxuICAgICAgICBjc3M6ICcvYS91c2VyaW50ZXJmYWNlL3VpYmFzZS92ZW5kb3IvcHJvY3VyaW9zL2FtZExvYWRlci9zcmMvcGx1Z2lucy9jc3MnLFxuICAgICAgICBrbm9ja291dDogJy9hL3VzZXJpbnRlcmZhY2UvdWliYXNlL3ZlbmRvci9rbm9ja291dC9kaXN0L2tub2Nrb3V0JyxcbiAgICAgICAga25vY2tvdXRtYXBwaW5nOiAnL2EvdXNlcmludGVyZmFjZS91aWJhc2UvdmVuZG9yL2tub2Nrb3V0LW1hcHBpbmcvYnVpbGQvb3V0cHV0L2tub2Nrb3V0Lm1hcHBpbmctbGF0ZXN0JyxcbiAgICAgICAgdGlueW1jZTQ6ICcvZmlsZXMvbW9kX2VkaXRvci92ZW5kb3IvdGlueW1jZS80LjUuNy90aW55bWNlLm1pbicsXG4gICAgICAgIHZlbmRvcjogJy9hL3VzZXJpbnRlcmZhY2UvdWliYXNlL3ZlbmRvcicsXG4gICAgICAgIGhpZ2hjaGFydHMyMzM6ICcvYS91c2VyaW50ZXJmYWNlL3VpYmFzZS92ZW5kb3IvaGlnaGNoYXJ0cy0yLjMuMycsXG4gICAgICAgIGhpZ2hjaGFydHM0MDE6ICcvYS91c2VyaW50ZXJmYWNlL3VpYmFzZS92ZW5kb3IvaGlnaGNoYXJ0cy00LjAuMScsXG4gICAgICAgIGhpZ2hjaGFydHM0MTU6ICcvYS91c2VyaW50ZXJmYWNlL3VpYmFzZS92ZW5kb3IvaGlnaGNoYXJ0cy00LjEuNScsXG4gICAgICAgIGNvbXBvbmVudDogJy9hL2xpYi9Db21wb25lbnQvc2NyaXB0JyxcbiAgICAgICAgZHJvcGxldDogJy9hL3VzZXJpbnRlcmZhY2UvdWliYXNlL2Ryb3BsZXRzJyxcbiAgICAgICAgbW9kdWxlOiAnL2EvdXNlcmludGVyZmFjZS9tb2R1bGUnLFxuICAgICAgICBlbGVtZW50UXVlcmllczogJy9hL3VzZXJpbnRlcmZhY2UvdWliYXNlL3ZlbmRvci9wcm9jdXJpb3MvZWxlbWVudFF1ZXJpZXMvZGlzdC9lbGVtZW50UXVlcmllcy5taW4nLFxuICAgICAgICByZXNpemVTZW5zb3I6ICcvYS91c2VyaW50ZXJmYWNlL3VpYmFzZS92ZW5kb3IvcHJvY3VyaW9zL3Jlc2l6ZVNlbnNvci9kaXN0L3Jlc2l6ZVNlbnNvci5taW4nLFxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7T2JqZWN0Lk9iamVjdH1cbiAgICAgKi9cbiAgICB2YXIgcGFja2FnZXMgPSB7XG4gICAgICAgIG1vbWVudDoge1xuICAgICAgICAgICAgbG9jYXRpb246ICcvYS91c2VyaW50ZXJmYWNlL3VpYmFzZS92ZW5kb3IvbW9tZW50JyxcbiAgICAgICAgICAgIG1haW46ICdtb21lbnQnXG4gICAgICAgIH0sXG4gICAgICAgIGNvZGVtaXJyb3I6IHtcbiAgICAgICAgICAgIGxvY2F0aW9uOiAnL2ZpbGVzL21vZF9lZGl0b3IvdmVuZG9yL2NvZGVtaXJyb3InLFxuICAgICAgICAgICAgbWFpbjogJ2xpYi9jb2RlbWlycm9yJ1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBub3JtYWxpemVkTW9kdWxlSWRcbiAgICAgKiBAcGFyYW0ge2FtZE1vZHVsZXxudWxsfSBjb250ZXh0XG4gICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRQYXRoIChub3JtYWxpemVkTW9kdWxlSWQsIGNvbnRleHQpIHtcbiAgICAgICAgY29udGV4dCA9IGNvbnRleHQgfHwgbnVsbDtcblxuICAgICAgICBpZiAoY29udGV4dCAhPT0gbnVsbCAmJiBpc1JlbGF0aXZlUGF0aChub3JtYWxpemVkTW9kdWxlSWQpKSB7XG4gICAgICAgICAgICByZXR1cm4gZGVjb3JhdGVXaXRoRXh0ZW5zaW9uKHJlc29sdmVSZWxhdGl2ZVBhdGgobm9ybWFsaXplZE1vZHVsZUlkLCBjb250ZXh0LmdldFBhdGgoKSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzUGFja2FnZShub3JtYWxpemVkTW9kdWxlSWQpKSB7XG4gICAgICAgICAgICByZXR1cm4gZGVjb3JhdGVXaXRoRXh0ZW5zaW9uKGdldFBhdGhGcm9tUGFja2FnZShub3JtYWxpemVkTW9kdWxlSWQpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBuYW1lUGFydHMgPSBub3JtYWxpemVkTW9kdWxlSWQuc3BsaXQoJy8nKTtcbiAgICAgICAgdmFyIGZpcnN0UGFydCA9IG5hbWVQYXJ0cy5zaGlmdCgpO1xuICAgICAgICBpZiAoIShmaXJzdFBhcnQgaW4gcGF0aHMpKSB7XG4gICAgICAgICAgICAvLyBBc3N1bWUgaXRzIGEgZnVsbCBwYXRoIHRvIChleHRlcm5hbCkgZmlsZVxuICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZWRNb2R1bGVJZDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBmb3VuZFBhdGggPSBwYXRoc1tmaXJzdFBhcnRdO1xuICAgICAgICBpZiAobmFtZVBhcnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGZvdW5kUGF0aCArPSAnLycgKyBuYW1lUGFydHMuam9pbignLycpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWNvcmF0ZVdpdGhFeHRlbnNpb24oZm91bmRQYXRoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbW9kdWxlTmFtZVxuICAgICAqIEByZXR1cm5zIHtib29sZWFufVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGlzUmVsYXRpdmVQYXRoIChtb2R1bGVOYW1lKSB7XG4gICAgICAgIHJldHVybiBtb2R1bGVOYW1lLm1hdGNoKC9cXC5cXC4/XFwvLykgIT09IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG1vZHVsZU5hbWVcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gZmlsZVBhdGhcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIHJlc29sdmVSZWxhdGl2ZVBhdGggKG1vZHVsZU5hbWUsIGZpbGVQYXRoKSB7XG4gICAgICAgIHZhciBuYW1lUGFydHMgPSBtb2R1bGVOYW1lLnNwbGl0KC9cXC8oPyFcXC8pLyk7XG4gICAgICAgIHZhciBmaWxlUGF0aFBhcnRzID0gZmlsZVBhdGguc3BsaXQoL1xcLyg/IVxcLykvKTtcblxuICAgICAgICAvLyBEcm9wIGZpbGUgbmFtZVxuICAgICAgICBmaWxlUGF0aFBhcnRzLnBvcCgpO1xuXG4gICAgICAgIHZhciBuYW1lUGFydDtcbiAgICAgICAgd2hpbGUgKG5hbWVQYXJ0ID0gbmFtZVBhcnRzLnNoaWZ0KCkpIHtcbiAgICAgICAgICAgIGlmIChuYW1lUGFydCA9PT0gJy4nKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChuYW1lUGFydCA9PT0gJy4uJykge1xuICAgICAgICAgICAgICAgIGlmIChmaWxlUGF0aFBhcnRzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCByZWxhdGl2ZSBwYXRoJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZpbGVQYXRoUGFydHMucG9wKCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZpbGVQYXRoUGFydHMucHVzaChuYW1lUGFydCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmlsZVBhdGhQYXJ0cy5qb2luKCcvJyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG1vZHVsZU5hbWVcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpc1BhY2thZ2UgKG1vZHVsZU5hbWUpIHtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIChtb2R1bGVOYW1lLmluZGV4T2YoJy8nKSA9PT0gLTEgPyBtb2R1bGVOYW1lIDogbW9kdWxlTmFtZS5zcGxpdCgnLycpWzBdKVxuICAgICAgICAgICAgaW4gcGFja2FnZXNcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbW9kdWxlTmFtZVxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0UGF0aEZyb21QYWNrYWdlIChtb2R1bGVOYW1lKSB7XG4gICAgICAgIHZhciBuYW1lUGFydHMgPSBtb2R1bGVOYW1lLnNwbGl0KCcvJyk7XG4gICAgICAgIHZhciBwYWNrYWdlTmFtZSA9IG5hbWVQYXJ0cy5zaGlmdCgpO1xuICAgICAgICB2YXIgbXlQYWNrYWdlID0gcGFja2FnZXNbcGFja2FnZU5hbWVdO1xuXG4gICAgICAgIHJldHVybiBteVBhY2thZ2VbJ2xvY2F0aW9uJ10gKyAnLycgKyAoXG4gICAgICAgICAgICBtb2R1bGVOYW1lLmluZGV4T2YoJy8nKSA9PT0gLTFcbiAgICAgICAgICAgICAgICA/IG15UGFja2FnZVsnbWFpbiddXG4gICAgICAgICAgICAgICAgOiBuYW1lUGFydHMuam9pbignLycpXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHBhdGhUb0RlY29yYXRlXG4gICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBkZWNvcmF0ZVdpdGhFeHRlbnNpb24gKHBhdGhUb0RlY29yYXRlKSB7XG4gICAgICAgIGlmIChwYXRoVG9EZWNvcmF0ZS5tYXRjaCgvXFwuKGNzc3xqcykkLykgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBwYXRoVG9EZWNvcmF0ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwYXRoVG9EZWNvcmF0ZSArICcuanMnO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGdldDogZ2V0UGF0aCxcbiAgICAgICAgcmVzb2x2ZTogcmVzb2x2ZVJlbGF0aXZlUGF0aFxuICAgIH07XG59KCkpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHBhdGg7XG4iLCJ2YXIgZ2V0UmVnaXN0cnkgPSAoZnVuY3Rpb24gKCkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8qKiBAdHlwZSB7T2JqZWN0fSAqL1xuICAgIHZhciBtb2R1bGVzID0ge307XG4gICAgLyoqIEB0eXBlIHtPYmplY3R9ICovXG4gICAgdmFyIGxpc3RlbmVycyA9IHt9O1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5vcm1hbGl6ZWRNb2R1bGVJZFxuICAgICAqIEByZXR1cm5zIHthbWRNb2R1bGV8bnVsbH1cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRNb2R1bGUgKG5vcm1hbGl6ZWRNb2R1bGVJZCkge1xuICAgICAgICBpZiAoIShub3JtYWxpemVkTW9kdWxlSWQgaW4gbW9kdWxlcykpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG1vZHVsZXNbbm9ybWFsaXplZE1vZHVsZUlkXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge2FtZE1vZHVsZX0gYW1kTW9kdWxlXG4gICAgICovXG4gICAgZnVuY3Rpb24gcmVnaXN0ZXJNb2R1bGUgKGFtZE1vZHVsZSkge1xuICAgICAgICBpZiAoYW1kTW9kdWxlLmdldElkKCkgaW4gbW9kdWxlcykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbW9kdWxlc1thbWRNb2R1bGUuZ2V0SWQoKV0gPSBhbWRNb2R1bGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHthbWRNb2R1bGV9IHRhcmdldE1vZHVsZVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyXG4gICAgICovXG4gICAgZnVuY3Rpb24gYWRkTGlzdGVuZXIgKHRhcmdldE1vZHVsZSwgbGlzdGVuZXIpIHtcbiAgICAgICAgaWYgKHRhcmdldE1vZHVsZS5pc0RlZmluZWQoKSkge1xuICAgICAgICAgICAgbGlzdGVuZXIodGFyZ2V0TW9kdWxlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBtb2R1bGVJZCA9IHRhcmdldE1vZHVsZS5nZXRJZCgpO1xuICAgICAgICBpZiAobGlzdGVuZXJzW21vZHVsZUlkXSkge1xuICAgICAgICAgICAgbGlzdGVuZXJzW21vZHVsZUlkXS5wdXNoKGxpc3RlbmVyKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxpc3RlbmVyc1ttb2R1bGVJZF0gPSBbbGlzdGVuZXJdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7YW1kTW9kdWxlfSBkZWZpbmVkTW9kdWxlXG4gICAgICovXG4gICAgZnVuY3Rpb24gcmVzb2x2ZSAoZGVmaW5lZE1vZHVsZSkge1xuICAgICAgICB2YXIgbGlzdGVuZXI7XG4gICAgICAgIHZhciBhY3RpdmVMaXN0ZW5lcnMgPSBsaXN0ZW5lcnNbZGVmaW5lZE1vZHVsZS5nZXRJZCgpXTtcbiAgICAgICAgaWYgKGFjdGl2ZUxpc3RlbmVycykge1xuICAgICAgICAgICAgd2hpbGUgKGxpc3RlbmVyID0gYWN0aXZlTGlzdGVuZXJzLnNoaWZ0KCkpIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcihkZWZpbmVkTW9kdWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGdldE1vZHVsZTogZ2V0TW9kdWxlLFxuICAgICAgICByZWdpc3Rlck1vZHVsZTogcmVnaXN0ZXJNb2R1bGUsXG4gICAgICAgIGFkZExpc3RlbmVyOiBhZGRMaXN0ZW5lcixcbiAgICAgICAgcmVzb2x2ZTogcmVzb2x2ZVxuICAgIH07XG59KCkpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGdldFJlZ2lzdHJ5O1xuIl19
