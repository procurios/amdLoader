define(function () {
    var processedResources = {};

   return {
       load: function (resource, isLoadedCallback) {
           processedResources[resource] = true;
           isLoadedCallback();
       },
       isResourceProcessed: function (resource) {
           return (resource in processedResources);
       }
   };
});