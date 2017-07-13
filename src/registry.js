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
