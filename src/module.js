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
