
(function (angular) {

     var mod = angular.module('martify', ['ng', 'sdr']);

     mod.run(
         function ($rootScope, $window, $location) {
             $rootScope.$on(
                 '$viewContentLoaded',
                 function () {
                     $window.ga('set', 'page', $location.path());
                     $window.ga('set', 'title', $window.document.title);
                     $window.ga('send', 'pageview');
                 }
             );
         }
     );

     mod.config(
         function ($locationProvider, $routeProvider) {
             $locationProvider.html5Mode(true);

             // This $route is the special SDR one. This function is not part of the standard $route.
             $routeProvider.pageType(
                 'home',
                 {
                     controller: function (articles, $scope) {
                         $scope.articles = articles;
                         window.document.title = window.siteName;
                     },
                     template: inlinedTemplate('home.html')
                 }
             );
             $routeProvider.pageType(
                 'article',
                 {
                     controller: function (article, $scope, $sce) {
                         $scope.article = article;
                         // Our HTML is trusted because it's generated from our RST sources.
                         article.body = $sce.trustAsHtml(article.body);
                         window.document.title = article.title + ' - ' + window.siteName;
                     },
                     template: inlinedTemplate('article.html')
                 }
             );
             $routeProvider.pageType(
                 'notFound',
                 {
                     controller: function () {
                         window.document.title = 'Not Found - Martin Atkins';
                     },
                     template: inlinedTemplate('404.html')
                 }
             );
         }
     );

     // This is a separate directive rather than just using ng-class because we need to ensure
     // we can always remove an existing bigface class if it's already present. This is important
     // because our template may already have it set for the benefit of non-JavaScript clients.
     mod.directive(
         'martifyBigface',
         function () {
             return {
                 restrict: 'A',
                 link: function (scope, element, attrs) {
                     scope.$watch(
                         'bigFace',
                         function (bigFace) {
                             if (bigFace === true) {
                                 element.addClass('bigface');
                             }
                             else if (bigFace === false) {
                                 element.removeClass('bigface');
                             }
                             // at first it'll be null, but we'll ignore it until
                             // we know for sure to avoid glitching it on and off
                             // if the first page is the home page.
                         }
                     );
                 }
             };
         }
     );

     // This is a separate directive rather than just using the ng-animate enter/leave on ng-view because
     // we want a different lifecycle:
     //  - animate out immediately on $routeChangeStart
     //  - wait until both the animation out has finished *and* $routeChangeSuccess fires before
     //   animating back in again.
     mod.directive(
         'martifyView',
         function ($route, $anchorScroll, $animate, $rootScope, $location) {
             return {
                 restrict: 'ECA',
                 terminal: true,
                 priority: 400,
                 transclude: 'element',
                 link: function(scope, $element, attr, ctrl, $transclude) {
                     var currentScope;
                     var currentElement;
                     var autoScrollExp = attr.autoscroll;
                     var onloadExp = attr.onload || '';
                     var fadedOut = true;
                     var routeReady = false; // angular fires routeChangeSuccess on startup
                     var firstTimeEnter = true;

                     var anchorNode = angular.element("<!-- view anchor -->");
                     $element.after(anchorNode);
                     $element.remove();

                     scope.$on(
                         '$routeChangeStart',
                         function () {
                             if (currentElement) {
                                 fadeOut();
                             }
                             // hacky bigface handling
                             if ($location.path() !== '/') {
                                 $rootScope.bigFace = false;
                             }
                         }
                     );
                     scope.$on(
                         '$routeChangeSuccess',
                         function () {
                             routeReady = true;
                             maybeFadeIn();
                         }
                     );
                     maybeFadeIn();

                     function fadeOut() {
                         routeReady = false;
                         fadedOut = false;
                         if (currentScope) {
                             currentScope.$destroy();
                             currentScope = null;
                         }
                         if (currentElement) {
                             $animate.leave(
                                 currentElement,
                                 function () {
                                     fadedOut = true;
                                     // apparently animation completion functions
                                     // don't run inside a digest cycle, so we have
                                     // to explicitly create one or else our animations
                                     // won't trigger. (Animations occur in a post-digest callback)
                                     $rootScope.$apply(
                                         function () {
                                             maybeFadeIn();
                                         }
                                     );
                                 }
                             );
                             currentElement = null;
                         }
                     }

                     function maybeFadeIn() {
                         // Wait until our fadeOut has finished and our new route is ready.
                         if (! (fadedOut && routeReady)) {
                             return;
                         }
                         fadedOut = false;

                         // hacky bigface handling
                         if ($location.path() == '/') {
                             $rootScope.bigFace = true;
                         }

                         var locals = $route.current && $route.current.locals,
                         template = locals && locals.$template;

                         if (angular.isDefined(template)) {
                             var newScope = scope.$new();
                             var current = $route.current;

                             var clone = $transclude(
                                 newScope,
                                 function (clone) {
                                     // don't animate the first time, since we want to seamlessly
                                     // transfer from a static DOM to an Angular-powered DOM with
                                     // no visual difference.
                                     if (firstTimeEnter) {
                                         anchorNode.after(clone);
                                         firstTimeEnter = false;
                                     }
                                     else {
                                         $animate.enter(
                                             clone,
                                             null,
                                             anchorNode,
                                             function onNgViewEnter () {
                                                 if (angular.isDefined(autoScrollExp)
                                                     && (!autoScrollExp || scope.$eval(autoScrollExp))) {
                                                     $anchorScroll();
                                                 }
                                             }
                                         );
                                     }
                                 }
                             );

                             currentElement = clone;
                             currentScope = current.scope = newScope;
                             currentScope.$emit('$viewContentLoaded');
                             currentScope.$eval(onloadExp);
                         }
                     }
                 }
             };
         }
     );

     mod.directive(
         'martifyView',
         function ($compile, $controller, $route) {
             return {
                 restrict: 'ECA',
                 priority: -400,
                 link: function(scope, $element) {
                     var current = $route.current,
                     locals = current.locals;

                     $element.html(locals.$template);

                     var link = $compile($element.contents());

                     if (current.controller) {
                         locals.$scope = scope;
                         var controller = $controller(current.controller, locals);
                         if (current.controllerAs) {
                             scope[current.controllerAs] = controller;
                         }
                         $element.data('$ngControllerController', controller);
                         $element.children().data('$ngControllerController', controller);
                     }

                     link(scope);
                 }
             };
         }
     );

})(angular);

//setTimeout(function () {
angular.bootstrap(
    document,
    [
        'ng',
        'ngAnimate',
        'sdr',
        'martify'
    ]
);
//}, 2000);
