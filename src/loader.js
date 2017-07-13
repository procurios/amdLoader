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
