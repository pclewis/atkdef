define(function(require) {

	var _     = require('underscore')
	  , Class = require('atk/class')
	  , ko    = require('knockout')
	  , nullo = ko.observable()
	  ;

	return new Class(
		{	MissingInput: {}

		,	init: function(self) {

				self.inpins  = {};
				self.outpins = {};

				_.each(self.inputs, function(properties, name) {
					// do something with type eventually...
					self.inpins[name] = ko.observable(nullo);
				});

				if(self.setup) {
					self.setup();
				}

				self.options = _.objMap(self.options, function(){  return ko.observable()  });

				_.each(self.outputs, function(properties, name) {
					var fn = _.isFunction(properties) ? properties : properties.fn;
					self.outpins[name] = ko.computed({
						read: _.bind(self._callOutputFn, self, fn)
					});
				});
			}

		,	connect: function(self, outputName, target, inputName) {
				target.inpins[inputName]( self.outpins[outputName] );
				if(self.onConnection) self.onConnection(outputName, target, inputName);
			}

		,	disconnect: function(self, outputName, target, inputName) {
				target.inpins[inputName]( nullo );
			}

		,	readInput: function(self, name, noThrow) {
				var result = self.inpins[name]()();
				if(result === undefined && !noThrow) throw self.MissingInput;
				return result;
			}

		,	readOption: function(self, name) {
				return self.options[name]();
			}

		,	_callOutputFn: function(self, fn) {
				try {
					return fn.apply(self, self.inpins);
				} catch(err) {
					if(err === self.MissingInput) return undefined;
					throw err;
				}
			}

		, inputs: []
		, outputs: []
	});

});