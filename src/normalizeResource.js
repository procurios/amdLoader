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
