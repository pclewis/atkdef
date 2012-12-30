define(function(require) {

	var ko = require('knockout')
	  , Class = require('atk/class')
	  , Component = require('atk/component')
	  , log = require('atk/log')
	  ,	readFile = function(file, cb) {
			if(file) file.read( cb );
			else cb(undefined);
		}
	  ;


	return new Class( 'FileComponent', Component,
		{	__init__: function(self, altFinder) {
				self.altFinder = altFinder;
			}
		,	setup: function(self) {
				self.plainTextData = ko.computed( function(){ return self.readOption('plainText')  }).extend({deferred: readFile});
				self.cipherTextData = ko.computed(function(){ return self.readOption('cipherText') }).extend({deferred: readFile});

				// nasty duped code
				self.options.plainText.value.subscribe( function(file) {
					if(self.readOption('link')) {
						var alt = self.altFinder(file);
						if(self.options.cipherText.value() !== alt)
							self.options.cipherText.value(alt);
					}
				});

				self.options.cipherText.value.subscribe( function(file) {
					if(self.readOption('link')) {
						var alt = self.altFinder(file);
						if(self.options.plainText.value() !== alt)
							self.options.plainText.value(alt);
					}
				});
			}
		,	name: 'File'
		,	options:
			{	'plainText':  { type: 'file', filter: 'PlainText'  }
			,	'cipherText': { type: 'file', filter: 'CipherText' }
			,	'link': { type: 'checkbox', default: true }
			}
		,	inputs: {}
		,	outputs:
			{	'plainText':  function(self) { return self.plainTextData();  }
			,	'cipherText': function(self) { return self.cipherTextData(); }
			}
		}
	);
});
