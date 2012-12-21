define(function(require) {

	var ko = require('knockout')
	  , Class = require('atk/class')
	  , Component = require('atk/component')
	  , log = require('atk/log')
	  ;

	return new Class( Component,
		{
			__init__: function(self, file, alt) {
				self.name = file.name();
				self.file = file;
				self.alternate = alt;
				self.data = ko.observable();
				self.file.read( function(data) {
					self.data(data);
				});
				if(self.alternate) {
					self.alternateData = ko.observable();
					self.outputs = {};
					log.info(self.file.fileType());
					self.outputs[self.file.fileType()] = function() { return this.data() };
					self.outputs[self.alternate.fileType()] = function() { return this.alternateData() };
					self.alternate.read( function(data) { self.alternateData(data) });
					self.name = self.file.baseName();
				}

			}

		,	name: 'file'
		,	inputs: {}
		,	outputs: { 'data': function(){  return this.data()  }}
		}
	);
});
