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
