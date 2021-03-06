var path = require('path'),
    inherit = require('inherit'),
    TestLogger = require('./mock-logger'),
    SharedResourcesStub = require('./shared-resources-stub'),
    vow = require('vow'),
    CacheStorage = require('enb/lib/cache/cache-storage'),
    Cache = require('enb/lib/cache/cache'),
    asyncFs = require('enb').asyncFs,
    fileEval = require('file-eval');

module.exports = inherit({
    __constructor: function (nodePath) {
        this._languages = [];
        this._logger = new TestLogger(nodePath);
        this._root = process.cwd();
        this._path = nodePath;
        this._dirname = path.join(this._root, nodePath);
        this._targetName = path.basename(nodePath);
        this._buildDefer = vow.defer();
        this._buildPromises = [];
        this._nodeCache = new Cache(new CacheStorage(), nodePath);
        this._techData = {};
        this._resultTechData = {};
        this._nodeTechData = {};
        this._levelNamingSchemes = {};
        this._sharedResources = new SharedResourcesStub();
        this.buildState = {};
    },
    getLanguages: function () {
        return this._languages;
    },
    setLanguages: function (languages) {
        this._languages = languages;
    },
    getLogger: function () {
        return this._logger;
    },
    setLogger: function (logger) {
        this._logger = logger;
    },
    getSharedResources: function () {
        return this._sharedResources;
    },
    getRootDir: function () {
        return this._root;
    },
    getDir: function () {
        return this._dirname;
    },
    getPath: function () {
        return this._path;
    },
    getTechs: function () {
        throw new Error('Method `getTechs` is not implemented.');
    },
    setTechs: function () {
        throw new Error('Method `setTechs` is not implemented.');
    },
    setTargetsToBuild: function () {
        throw new Error('Method `setTargetsToBuild` is not implemented.');
    },
    setTargetsToClean: function () {
        throw new Error('Method `setTargetsToClean` is not implemented.');
    },
    setBuildGraph: function () {
        throw new Error('Method `setBuildGraph` is not implemented.');
    },
    resolvePath: function (filename) {
        return path.resolve(this._dirname, filename);
    },
    resolveNodePath: function (nodePath, filename) {
        return path.join(this._root, nodePath, filename);
    },
    unmaskNodeTargetName: function (nodePath, targetName) {
        return targetName.replace(/\?/g, path.basename(nodePath));
    },
    relativePath: function (filename) {
        var res = path.relative(path.join(this._root, this._path), filename);
        if (res.charAt(0) !== '.') {
            res = '.' + path.sep + res;
        }
        return res;
    },
    unmaskTargetName: function (targetName) {
        return targetName.replace(/\?/g, this._targetName);
    },
    getTargetName: function (suffix) {
        return this._targetName + (suffix ? '.' + suffix : '');
    },
    wwwRootPath: function (filename, wwwRoot) {
        wwwRoot = wwwRoot || '/';
        return wwwRoot + path.relative(this._root, filename);
    },
    cleanTargetFile: function () {
        throw new Error('Method `cleanTargetFile` is not implemented.');
    },
    createTmpFileForTarget: function () {
        throw new Error('Method `createTmpFileForTarget` is not implemented.');
    },
    loadTechs: function () {
        throw new Error('Method `loadTechs` is not implemented.');
    },
    hasRegisteredTarget: function () {
        throw new Error('Method `hasRegisteredTarget` is not implemented.');
    },
    resolveTarget: function (target, value) {
        this._resultTechData[target] = value;
        this._buildDefer.resolve(value);
        this._buildPromises.push(vow.resolve(value));
    },
    isValidTarget: function (targetName) {
        this._logger.isValid(targetName);
    },
    rejectTarget: function (targetName, error) {
        this._buildDefer.reject(error);
    },
    requireNodeSources: function (sourcesByNodes) {
        var resultByNodes = {};

        Object.keys(sourcesByNodes).forEach(function (nodePath) {
            resultByNodes[nodePath] = sourcesByNodes[nodePath].map(function (target) {
                var node = this._nodeTechData[nodePath];
                return node && node[target];
            }, this);
        }, this);

        return vow.resolve(resultByNodes);
    },
    requireSources: function (sources) {
        return vow.all(sources.map(function (source) {
            return vow.resolve(this._techData[source]);
        }, this));
    },
    cleanTargets: function () {
        throw new Error('Method `cleanTargets` is not implemented.');
    },
    build: function () {
        throw new Error('Method `build` is not implemented.');
    },
    clean: function () {
        throw new Error('Method `clean` is not implemented.');
    },
    getNodeCache: function (subCacheName) {
        return subCacheName ? this._nodeCache.subCache(subCacheName) : this._nodeCache;
    },
    getLevelNamingScheme: function (levelPath) {
        return this._levelNamingSchemes[levelPath];
    },
    destruct: function () {
        throw new Error('Method `destruct` is not implemented.');
    },

    provideTechData: function (targetName, value) {
        targetName = this.unmaskTargetName(targetName);
        this._techData[targetName] = value;
    },
    provideNodeTechData: function (node, targetName, value) {
        targetName = this.unmaskTargetName(targetName);

        if (!this._nodeTechData[node]) {
            this._nodeTechData[node] = {};
        }
        this._nodeTechData[node][targetName] = value;
    },
    provideLevelNamingScheme: function (level, schemeBuilder) {
        var levels = Array.isArray(level) ? level : [level],
            _this = this;
        levels.forEach(function (levelPath) {
            if (levelPath.charAt(0) !== path.sep) {
                levelPath = _this.resolvePath(levelPath);
            }
            _this._levelNamingSchemes[levelPath] = schemeBuilder;
        });
        return this;
    },
    runTech: function (TechClass, options) {
        options = options || {};
        var tech = new TechClass(options);
        tech.init(this);
        return vow.resolve().then(function () {
            return vow.when(tech.build()).then(function () {
                return this._buildDefer.promise();
            }.bind(this));
        }.bind(this));
    },
    runTechAndGetResults: function (TechClass, options) {
        options = options || {};
        var tech = new TechClass(options);
        tech.init(this);
        return vow.resolve().then(function () {
            return vow.when(tech.build()).then(function () {
                return vow.all(this._buildPromises).then(function () {
                    var resultByTargets = {};
                    tech.getTargets().forEach(function (targetName) {
                        resultByTargets[targetName] = this._resultTechData[targetName];
                    }, this);
                    return resultByTargets;
                }.bind(this));
            }.bind(this));
        }.bind(this));
    },
    runTechAndGetContent: function (TechClass, options) {
        options = options || {};
        var _this = this,
            tech = new TechClass(options);
        tech.init(this);
        return vow.resolve().then(function () {
            return vow.when(tech.build()).then(function () {
                return this._buildDefer.promise().then(function () {
                    return vow.all(tech.getTargets().map(function (targetName) {
                        return asyncFs.read(_this.resolvePath(targetName), 'utf-8');
                    }, this));
                }.bind(this));
            }.bind(this));
        }.bind(this));
    },
    runTechAndRequire: function (TechClass, options) {
        options = options || {};
        var _this = this,
            tech = new TechClass(options);
        tech.init(this);
        return vow.resolve().then(function () {
            return vow.when(tech.build()).then(function () {
                return this._buildDefer.promise().then(function () {
                    return vow.all(tech.getTargets().map(function (targetName) {
                        var filename = _this.resolvePath(targetName);

                        return fileEval(filename, { context: options.context });
                    }, this));
                }.bind(this));
            }.bind(this));
        }.bind(this));
    }
});
