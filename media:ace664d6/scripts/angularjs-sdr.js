(function (angular) {

    var sdr = angular.module('sdr', []);

    sdr.provider(
        '$routeParams',
        function () {
            this.$get = function () {
                return {};
            };
        }
    );

    sdr.provider(
        '$route',
        function () {
            var routes = {};
            var pageTypes = {};
            var sdrPrefix = '/:';

            this.when = function (path, route) {
                routes[path] = angular.extend(
                    {
                        reloadOnSearch: true,
                        originalPath: path
                    },
                    route
                );

                if (path) {
                    var redirectPath = (path[path.length-1] == '/')
                        ? path.substr(0, path.length-1)
                        : path +'/';

                    routes[redirectPath] = {
                        redirectTo: path,
                        originalPath: redirectPath
                    };
                };

                return this;
            };

            this.otherwise = function (params) {
                this.when(null, params);
                return this;
            };

            this.pageType = function (name, def) {
                pageTypes[name] = def;
                return this;
            };

            this.setSdrPrefix = function (prefix) {
                sdrPrefix = prefix;
            };

            this.$get = function ($rootScope, $location, $window, $injector, $q, $routeParams, $http) {

                var $route = {};

                function updateRoute() {
                    var last = $route.current;

                    // In the normal client-defined case we'd be able to find the route
                    // synchronously, but since we have to ask the server for this one
                    // we have to emit the $routeChangeStart event before we actually
                    // know the route, so any listener to that event had better be
                    // prepared to accept an empty route here.
                    var next = {};
                    $rootScope.$broadcast('$routeChangeStart', next, last);
                    $route.current = next;

                    function completeRouteChange(serverRoute) {
                        var path = serverRoute.path;
                        if (serverRoute.pageType && pageTypes[serverRoute.pageType]) {
                            serverRoute.controller = pageTypes[serverRoute.pageType].controller;
                            serverRoute.template = pageTypes[serverRoute.pageType].template;
                        }
                        var clientRoute = routes[path];
                        next.controller = serverRoute.controller;
                        next.template = serverRoute.template;
                        next.pathParams = serverRoute.pathParams;
                        next.params = angular.copy(next.pathParams);
                        next.locals = serverRoute.locals;
                        next.locals.$template = next.template;
                        next.$$route = clientRoute;
                        var resolveKey;
                        if (serverRoute.localServices) {
                            for (resolveKey in serverRoute.localServices) {
                                next.locals[resolveKey] = $injector.get(
                                    serverRoute.localServices[resolveKey]
                                );
                            }
                        }
                        if (clientRoute && clientRoute.resolve) {
                            for (resolveKey in clientRoute.resolve) {
                                if (next.locals[resolveKey] === undefined) {
                                    next.locals[resolveKey] = (
                                        locals[key] = angular.isString(value) ?
                                            $injector.get(value) :
                                            $injector.invoke(value)
                                    );
                                }
                            }
                        }

                        $q.all(next.locals).then(
                            function () {
                                if (next == $route.current) {
                                    if (next) {
                                        angular.copy(next.params, $routeParams);
                                    }
                                    $rootScope.$broadcast('$routeChangeSuccess', next, last);
                                }
                            }
                        );
                    }

                    // if we're rendering the result of an HTML snapshot response then
                    // the server will have told us what route to use already.
                    if ($window.initialRoute) {
                        var initialRoute = window.initialRoute;
                        $window.setTimeout(
                            function () {
                                completeRouteChange(initialRoute);
                            },
                            1
                        );
                        // make sure we don't try to use this again next time
                        $window.initialRoute = undefined;
                    }
                    else {
                        var apiUrl = sdrPrefix + $location.path() + 'index.json';

                        $http.get(apiUrl).then(
                            function (response) {
                                var data = response.data;
                                completeRouteChange(data);
                            }
                        );
                    }
                }

                $rootScope.$on('$locationChangeSuccess', updateRoute);

                return $route;

            };
        }
    );
})(angular);
