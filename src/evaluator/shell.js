// shell.js
//

var npm = require('npm'),
    path = require('path'),
    util = require('util'),
    vm = require('vm'),
    Q = require('q');

var commands = require('./commands');

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

function createGlobals(shell) {
  var globals = {
    Buffer: Buffer,
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

  globals.global = globals;

  return globals;
}

function createError() {
  var e = new Error(util.format.apply(null, arguments));
  e.trace = false;

  return e;
}

function Shell(config) {
  this._config = config;
  this._state = createGlobals(this);
  this._context = vm.createContext(this._state);
  this._requiredModules = {};
  this._loadedModules = {};
}

Shell.prototype.createTrace = function(error) {
  var lines = (error.stack || '').split('\n');

  var trace = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('Shell.') > 0) {
      break;
    }
    trace.push(lines[i]);
  }

  return trace;
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
  var options = { filename: 'code', displayErrors: false };
  options.toString = function() {
    return 'code[' + evaluationId + ']';
  };

  return vm.runInContext(code, this._context, options);
}

Shell.prototype._evaluateCommand = function(text, evaluationId) {
  var command = commands.parse(text);
  if (!command) {
    throw createError('Invalid command syntax.');
  }

  // TODO: Generalize
  if (command.name == 'module') {
    if (command.args.length != 1) {
      throw createError('Expected a single module name argument.');
    }

    var shell = this;
    var deferred = Q.defer();

    npm.commands.install(shell._config.modulesPath, command.args, function(error) {
      if (error) {
        deferred.reject(error);
      }
      else {
        shell._loadedModules[command.args[0]] = true;
        deferred.resolve();
      }
    });
    return deferred.promise;
  }

  throw createError('Unknown command "%s"', command.name);
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
  var npmOptions = { prefix: config.modulesPath, loglevel: 'silent', spin: false, color: false };
  npm.load(npmOptions, function() {
    callback(new Shell(config));
  });
}

module.exports = {
  create: createShell
};
