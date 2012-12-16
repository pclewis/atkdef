define( function(require) {
	var _ = require('underscore');
	
	// want to be able to hook these at some point
	return _.object(
		_.map( ['info', 'warn', 'debug', 'error', 'log'],
			function(f){  return [f, _.bind( window.console[f] || window.console.log, window.console)]  }
		)
	);
});