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
