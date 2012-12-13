function fileSystemError(e) {
	var msg = '';

	switch (e.code) {
		case FileError.QUOTA_EXCEEDED_ERR:
		msg = 'QUOTA_EXCEEDED_ERR';
		break;
		case FileError.NOT_FOUND_ERR:
		msg = 'NOT_FOUND_ERR';
		break;
		case FileError.SECURITY_ERR:
		msg = 'SECURITY_ERR';
		break;
		case FileError.INVALID_MODIFICATION_ERR:
		msg = 'INVALID_MODIFICATION_ERR';
		break;
		case FileError.INVALID_STATE_ERR:
		msg = 'INVALID_STATE_ERR';
		break;
		default:
		msg = 'Unknown Error';
		break;
	};

	log.error('FileSystem Error: ' + msg);
	throw e;
}

/**
 * Make a computed observable where the value is set by a callback instead of being returned immediately.
 * The 'option' should be a function which takes two parameters: the value returned by the extended observable, and a callback function to use to set the value
 */
ko.extenders.deferred = function(target, fn) {
	var actual = ko.observable()
	  , update = _.partial( fn, _.__, actual );

	target.subscribe(update);
	update(target());

	return actual;
};

var File = function(viewModel, fileEntry) {
	var self = this;

	self.name         = ko.observable(fileEntry.name);
	self.fileEntry    = ko.observable(fileEntry);

	this.isPlainText  = ko.computed(function(){  return viewModel.fileNameRegexPlainText().test(self.name())   });
	this.isCipherText = ko.computed(function(){  return viewModel.fileNameRegexCipherText().test(self.name())  });

	this.fileType     = ko.computed(function() {
		if(self.isPlainText())  return FileType.PLAINTEXT;
		if(self.isCipherText()) return FileType.CIPHERTEXT;
		return FileType.UNKNOWN;
	});

	this.baseName     = ko.computed(function() {
		var r = viewModel.fileNameRegexPlainText().exec(self.name()) || viewModel.fileNameRegexCipherText().exec(self.name());
		return r ? r[1] : self.name();
	});

};

var FileType = {
	PLAINTEXT: 'PlainText',
	CIPHERTEXT: 'CipherText',
	UNKNOWN: 'Unknown',
	invert: function(t) {
		switch(t) {
			case FileType.PLAINTEXT:  return FileType.CIPHERTEXT;
			case FileType.CIPHERTEXT: return FileType.PLAINTEXT;
			default: return t;
		}
	}
};

var ViewModel = function() {
	var self = this;

	this.fileSystem   = ko.observable();
	this.selectedFile = ko.observable(); // File  // idea: .contract extender to enforce types/etc...
	this.files        = ko.observableArray();
	this.fileFilter   = ko.observable();

	this.fileNameRegexCipherText = ko.observable( /^(.*)\.dat$/i );
	this.fileNameRegexPlainText  = ko.observable( /^(.*)\.(bin|dat)\.mp3$/i );


	this.fileSystem.subscribe( function(fileSystem){
		self.files.removeAll();
		fileSystem.root.createReader().readEntries(function(entries){
			self.files.push.apply(self.files,
				_(entries).map(function(e){  return new File(self, e)  })
			);
		});
	});

};

/* Shortcut */
ViewModel.prototype._deferred = function(obs, fn) {
	return ko.computed(obs, this).extend( {deferred: fn} );
}

/**
 * Show a multi-file selection dialog box.
 * NOTE: If Cancel is pressed, no resolution will ever happen.
 *
 * @todo fail previous promise when opening a new one? there can only be one up at a time...
 * @resolve {[File]} when files are selected
 */
ViewModel.prototype.selectFiles = function() {
	var deferred = new $.Deferred()
	  , input = $('<input type="file" multiple>')
	  ;

	log.info("Showing file selector");

	input.change( function() {
		log.info("Selected " + input[0].files.length + " files.");
		deferred.resolve(input[0].files);
	});

	input.click();

	return deferred.promise();
};

/**
 * Copy passed files into the local storage.
 * @param {[File]} files List of files to add.
 * @resolve When all files are added.
 */
ViewModel.prototype.addFiles = function(files) {
	var self = this;

	log.info("In addFiles");

	// TODO: ask to overwrite?
	return $.when( 
		_.map(files, function(file) {
			console.log("Creating " + file.name);
			return $.Deferred( function(d) {
						self.fileSystem().root.getFile(file.name, {create: true, exclusive: true}, d.resolve, d.reject);
					}).pipe( function(fe) {
					 	return $.Deferred(function(d) {
					 		fe.createWriter(d.resolve, d.reject);
					 	});
					}).done( function(fw) {
						fw.write(file);
				 		self.fileSystem().root.getFile( file.name, {}, _.bind(self.files.push, self.files) );
					}).fail( fileSystemError );
		})
	);
};

/**
 * Delete passed file from local storage.
 * @param  {FileEntry} fileEntry File to delete
 */
ViewModel.prototype.deleteFile = function(fileEntry) {
	var self = this;
	if(confirm("Delete file " + fileEntry.name + "?")) {
		fileEntry.remove( function() {
			log.info("Deleted file " + fileEntry.name);
			self.files.remove(fileEntry);
		}, fileSystemError)
	}
};

/**
 * Compose potentially Deferred method calls on the ViewModel.
 * compose( f, g, x ) returns a function which returns a Deferred which will pass the result of f(g(x)) when finished.
 * Each function converted to a Deferred and piped in order, ex: x().pipe(g).pipe(f)
 * Note: 'this' will be the ViewModel instance in each function.
 */
ViewModel.prototype.compose = function() {
	var fns = arguments
	  , self = this
	  ;

	return function() {
		var start = new $.Deferred()
		  , composed = _.reduceRight( fns, function(d, f) {
				return d.pipe(function() { return $.when( f.apply(self, arguments) ); })
			}, start );
		start.resolve();
		return composed;
	}
}

var viewModel;
window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;

$.Deferred(function(d){
	/* FIXME magic number */
	window.requestFileSystem( window.PERSISTENT, 1*1024*1024*1024 /* 1GB */, d.resolve, d.reject);
}).pipe(function(fileSystem) {
	log.info("Got fileSystem");
	viewModel = new ViewModel();
	viewModel.fileSystem(fileSystem);
	// on chrome, we have to request the quota in another step before we're done
	if(webkitStorageInfo) {
		return $.Deferred(function(d) { webkitStorageInfo.requestQuota( webkitStorageInfo.PERSISTENT, 1*1024*1024*1024, d.resolve, d.reject );  });
	}
}).done(function() {
	log.info("Got quota");
	ko.applyBindings(viewModel);
});


