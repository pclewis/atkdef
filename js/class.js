define(function(require) {

	var _ = require('underscore')
	  , addSelfAsFirstArgument = function(fn) {
			return function() {
				var args = _(arguments).toArray();
				args.unshift(this);
				return fn.apply(this, args);
			};
		}
	  ;

	require('underscore.objMapFunctions');

	return function(parent, def) {
		if(def === undefined) {
			def = parent;
			parent = undefined;
		}

		var newClass = function() {
			if(this.__init__) this.__init__.apply(this, arguments);
		};

		if(parent) _.extend( newClass.prototype, parent.prototype );

		_.extend( newClass.prototype, _.objMap(def, function(v/*,k*/){   return _.isFunction(v) ? addSelfAsFirstArgument(v) : v   }) );

		return newClass;
	};

});