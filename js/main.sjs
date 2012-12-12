var _ = require('./lib/underscore-min.js');
_.each( ['hi', 'bye'], function(v, k) {
	alert(v + " from sjs");
});
