define(function(require) {

	var _     = require('underscore')
	  , Class = require('atk/class')
	  , ko    = require('knockout')
	  , nullo = ko.observable()
	  , usedIds = []
	  ;


	return new Class(
		{	MissingInput: {}

		,	init: function(self) {

				self.inpins  = {};
				self.outpins = {};
				if(!self.id) {
					// If we load from a file, _.uniqueId() might not generate unique ids anymore. This is a crummy hack. Think of something better.
					do {
						self.id = _.uniqueId('C');
					} while(_.contains(usedIds, self.id));
				}
				usedIds.push(self.id);

				self.connections = {};

				_.each(self.inputs, function(properties, name) {
					// do something with type eventually...
					self.inpins[name] = ko.observable(nullo);
				});

				self.options = _.objMap(self.options, function(v){
					// hacky...
					var obs = ko.observable();
					obs.type = v;
					return obs;
				});

				if(self.setup) {
					self.setup();
				}

				self.outpins = _.objMap(self.outputs, function(properties) {
					var fn = _.isFunction(properties) ? properties : properties.fn;
					return ko.computed(_.bind(self._callOutputFn, self, fn));
				});
			}

		,	connect: function(self, outputName, target, pinName, pinType) {
				var targetObj = (pinType === 'input') ? target.inpins : target.options;
				if(self.connections[outputName]) self.disconnect(outputName, self.connections[outputName].target, self.connections[outputName].pin, self.connections[outputName].type);
				self.connections[outputName] = {target: target, pin: pinName, type: pinType};
				targetObj[pinName]( self.outpins[outputName] );
				if(self.onConnection) self.onConnection(outputName, target, pinName, pinType);
			}

		,	disconnect: function(self, outputName, target, pinName, pinType) {
				delete self.connections[outputName];
				if(pinType === 'input')
					target.inpins[pinName]( nullo );
				else if(pinType === 'option')
					target.options[pinName]( undefined );
			}

		,	readInput: function(self, name, noThrow) {
				var result = self.inpins[name]()();
				if(result === undefined && !noThrow) throw self.MissingInput;
				return result;
			}

		,	readOption: function(self, name) {
				var result = self.options[name]();
				if(ko.isObservable(result)) result = result();
				return result;
			}

		,	_callOutputFn: function(self, fn) {
				try {
					return fn.apply(self);
				} catch(err) {
					if(err === self.MissingInput) return undefined;
					throw err;
				}
			}

		, inputs: []
		, outputs: []
	});

});