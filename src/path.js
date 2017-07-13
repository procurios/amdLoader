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
