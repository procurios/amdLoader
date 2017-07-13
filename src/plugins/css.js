define(['require'], function (require) {
    'use strict';

    /** @type {Node} */
    var head = document.getElementsByTagName('head')[0];
    /** @type {Object} */
    var processedResources = {};

    /**
     * @param {string} resource
     * @param {Function} callback
     */
    function loadCssFile (resource, callback) {
        processedResources[resource] = true;

        var url = require.toUrl(resource);

        var styleSheet = document.createElement('link');
        styleSheet.media = 'all';
        styleSheet.rel = 'stylesheet';
        styleSheet.href = url;

        styleSheet.onload = styleSheet.onreadystatechange = function () {
            if (this.readyState && !(/^(complete|loaded)$/.test(this.readyState))) {
                return;
            }

            styleSheet.onload = styleSheet.onreadystatechange = null;
            callback();
        };

        head.appendChild(styleSheet);
    }

    return {
        /**
         * @param {string} resource
         * @param {Function} callback
         */
        load: function (resource, callback) {
            if (resource in processedResources) {
                return;
            }

            loadCssFile(resource, callback);
        }
    };
});
