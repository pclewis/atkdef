// want to be able to hook these at some point
window.log = _.object(
	_.map( ['info', 'warn', 'debug', 'error', 'log'],
		function(f) {
			return [ f, _.bind( console[f] || console.log, console) ]
		}
	)
);

