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
