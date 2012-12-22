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

	var isReallyObject = function(v) {
		return _.isObject(v) && !_.isFunction(v) && !_.isArray(v);
	};

	return function Class() {
		var name   = _.find(arguments, _.isString) || _.uniqueId('Class')
		  , parent = _.find(arguments, _.isFunction)
		  , def    = _.find(arguments, isReallyObject)
		  ;

		if(def === undefined) {
			def = parent;
			parent = undefined;
		}

		var newClass = eval("(function " + name + "() {  if(this.__init__) this.__init__.apply(this, arguments); return this; })");

		if(parent) _.extend( newClass.prototype, parent.prototype );

		_.extend( newClass.prototype, _.objMap(def, function(v/*,k*/){   return _.isFunction(v) ? addSelfAsFirstArgument(v) : v   }) );

		newClass.prototype.super = parent;

		return newClass;
	};

});