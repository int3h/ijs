// shell.js
//

var npm = require('npm'),
    path = require('path'),
    vm = require('vm');

var Q = require('q');

var _knownModules = {
  async: 'async',
  crypto: 'crypto',
  events: 'events',
  fs: 'fs',
  http: 'http',
  https: 'https',
  net: 'net',
  os: 'os',
  path: 'path',
  stream: 'stream',
  querystring: 'querystring',
  url: 'url',
  util: 'util',
  zlib: 'zlib'
};

var _commandPattern = /^%%?([a-zA-Z0-9\\._]+)(\s+)?([^\n]*)?(\n)?(.*)?$/;

function createGlobals(shell) {
  var globals = {
    Buffer: Buffer,
    global: globals,
    console: console,
    require: function(name) {
      return shell._require(name);
    },
    runAsync: function(fn) {
      var deferred = Q.defer();
      fn(deferred);

      return deferred.promise;
    }
  };
  return globals;
}

function Shell(config) {
  this._config = config;
  this._state = createGlobals(this);
  this._context = vm.createContext(this._state);
  this._requiredModules = {};
  this._loadedModules = {};
}

Shell.prototype.evaluate = function(text, evaluationId) {
  if (text.charAt(0) === '%') {
    return this._evaluateCommand(text, evaluationId);
  }
  else {
    return this._evaluateCode(text, evaluationId);
  }
}

Shell.prototype._evaluateCode = function(code, evaluationId) {
  return vm.runInContext(code, this._context,
                         { filename: 'code', displayErrors: false });
}

Shell.prototype._evaluateCommand = function(text, evaluationId) {
  var match = _commandPattern.exec(text);
  if (!match) {
    // TODO: Custom error type
    throw new Error('Invalid command syntax.');
  }

  var commandName = match[1];
  var commandArgs = match[3].trim().split(' ');
  var commandData = match[5];

  // TODO: Generalize
  if (commandName == 'module') {
    if (commandArgs.length != 1) {
      throw new Error('Expected module name argument');
    }

    var shell = this;
    var deferred = Q.defer();

    npm.commands.install(shell._config.modulesPath, commandArgs, function(error) {
      if (error) {
        deferred.reject(error);
      }
      else {
        shell._loadedModules[commandArgs[0]] = true;
        deferred.resolve();
      }
    });
    return deferred.promise;
  }

  throw new Error('Unknown command');
}

Shell.prototype._require = function(name) {
  var module = this._requiredModules[name];
  if (module) {
    return module;
  }

  if (_knownModules[name]) {
    module = require(name);
  }
  else {
    var modulePath = path.join(this._config.modulesPath, 'node_modules', name);
    module = require(modulePath);
  }

  if (module) {
    this._requiredModules[name] = module;
  }

  return module;
};


function createShell(config, callback) {
  npm.load(function() {
    callback(new Shell(config));
  });
}

module.exports = {
  create: createShell
};
