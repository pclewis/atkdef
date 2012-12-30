define(function(require) {

	var _     = require('underscore')
	  , Class = require('atk/class')
	  , ko    = require('knockout')
	  , nullo = ko.observable()
	  , usedIds = []
	  ;


	return new Class( "Component",
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
					var obj = (typeof v === 'string') ? {type: v} : _.clone(v);
					obj.value = ko.observable(obj.default);
					return obj;
				});

				if(self.setup) {
					self.setup();
				}

				self.connections = _.objMap(self.outputs, function(){ return [] });

				self.outpins = _.objMap(self.outputs, function(properties) {
					var fn = _.isFunction(properties) ? properties : properties.fn;
					return ko.computed(_.bind(self._callOutputFn, self, fn));
				});
			}

		,	destroy: function(self) {
				usedIds = _(usedIds).without([self.id]);
			}

		,	removeConnections: function(self, outputName, target, pinName, pinType) {
				self.connections[outputName] = _(self.connections[outputName]).reject( function(conn) {
					return conn.target === target && conn.pin === pinName && conn.type === pinType;
				});
			}
		,	connect: function(self, outputName, target, pinName, pinType) {
				var targetObj = (pinType === 'input') ? target.inpins[pinName] : target.options[pinName].value;
				self.removeConnections(outputName, target, pinName, pinType);
				self.connections[outputName].push( {target: target, pin: pinName, type: pinType} );
				targetObj( self.outpins[outputName] );
				if(self.onConnection) self.onConnection(outputName, target, pinName, pinType);
			}

		,	disconnect: function(self, outputName, target, pinName, pinType) {
				self.removeConnections(outputName, target, pinName, pinType);
				if(pinType === 'input')
					target.inpins[pinName]( nullo );
				else if(pinType === 'option')
					target.options[pinName].value( undefined );
			}

		,	readInput: function(self, name, noThrow) {
				var result = self.inpins[name]()();
				if(result === undefined && !noThrow) throw self.MissingInput;
				return result;
			}

		,	readOption: function(self, name) {
				var result = self.options[name].value();
				if(ko.isObservable(result)) result = result();
				return result;
			}

		,	_callOutputFn: function(self, fn) {
				try {
					return fn.apply(self, [self]);
				} catch(err) {
					if(err === self.MissingInput) return undefined;
					throw err;
				}
			}

		, inputs: []
		, outputs: []
	});

});