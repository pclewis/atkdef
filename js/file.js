define(function(require) {
	var ko       = require('knockout')
	  , FileType = require('atk/fileType')
	  , Class    = require('atk/class')
	  ;

	return new Class( "File",
		{	__init__: function(self, viewModel, fileEntry) {
				/* TODO: this should depend on some global/passed config thing instead of the main view model specifically */
				self.name         = ko.observable(fileEntry.name);
				self.fileEntry    = ko.observable(fileEntry);

				self.isPlainText  = ko.computed(function(){  return viewModel.fileNameRegexPlainText().test(self.name())   });
				self.isCipherText = ko.computed(function(){  return viewModel.fileNameRegexCipherText().test(self.name())  });

				self.fileType     = ko.computed(function() {
					if(self.isPlainText())  return FileType.PLAINTEXT;
					if(self.isCipherText()) return FileType.CIPHERTEXT;
					return FileType.UNKNOWN;
				});

				self.baseName     = ko.computed(function() {
					var r = viewModel.fileNameRegexPlainText().exec(self.name()) || viewModel.fileNameRegexCipherText().exec(self.name());
					return r ? r[1] : self.name();
				});
			}

		,	read: function(self, cb) {
				var reader = new FileReader();
				reader.onloadend = function() { cb(this.result) };
				self.fileEntry().file(function(file){  reader.readAsBinaryString(file)  });
			}

		,	toURL: function(self) { return self.fileEntry().toURL(); }
		}
	);
});