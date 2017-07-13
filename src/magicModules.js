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
