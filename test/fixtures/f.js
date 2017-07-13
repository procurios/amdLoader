define(['require'], function (require) {
   return {
       getG: function (callback) {
            require([require.toUrl('./g.js')], function (g) {
                callback(g.get());
            });
       }
   };
});