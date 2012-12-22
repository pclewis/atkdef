/*jshint worker: true*/
/*global _:false*/
importScripts("../lib/underscore-min.js");

function pad(str, n, chr) {
	while(str.length < n) {
		str = chr + str;
	}
	return str;
}

function convertToBase(data, base, spacers, maxLength) {
	if(!data) return "";
	spacers = spacers || {1: {0: ' '}, 16: { 8: ' ', 0: "\n"} };
	var out = ""
	  , length = _.min([maxLength || data.length, data.length])
	  , itemSize = (0xFF).toString(base).length
	  , maxSpacerMod = _.max( _.map(spacers, function(v,k) { return parseInt(k,10); }))
	  ;
	for(var i = 0; i < length; ++i) {
		if(i>0) {
			for(var j = 1; j <= maxSpacerMod; ++j) {
				if(spacers[j]) {
					var text = spacers[j][i % j];
					if(text) out += text;
				}
			}
		}

		out += pad(data.charCodeAt(i).toString(base), itemSize, "0");
	}
	return out;
}

self.onmessage = function(e) {
	var msg = e.data;
	self.postMessage( convertToBase( msg.data, msg.base, msg.spacers, msg.maxLength ));
};

