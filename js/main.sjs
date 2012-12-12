var log = require('apollo:logging')
  , collection = require('apollo:collection')
  , ko = require('./lib/knockout')
  , _ = require('./lib/underscore-min')
  ;

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

var ViewModel = function(fileSystem) {
	this.fileSystem   = ko.observable(fileSystem);
	this.files        = ko.observableArray();
	this.selectedFile = ko.observable(); // File  // idea: .contract extender to enforce types/etc...

};

ViewModel.prototype.selectFiles = function() {
	log.info("creating file selector");
	var input = $('<input type="file" multiple>');
	waitfor(var files) {
		input.change( function() { resume(input[0].files); });
		input.click();
		_.defer( function() {
			$(document.body).one('click', function() { resume(null); });
		});
	} retract {
		log.info("wait cancelled");
	}

	if(!files) {
		log.info("Selection cancelled.");
		return [];
	} else {
		log.info("Selected " + files.length + " files.");
		return files;
	}
};

ViewModel.prototype.addFiles = function(files) {
	var self = this;
	log.info("In addFiles");
	collection.par.each(files, function(file) {
		console.log("Creating " + file.name);
		waitfor(var fe) { self.fileSystem().root.getFile(file.name, {create: true, exclusive: true}, resume, fileSystemError); }
		waitfor(var fw) { fe.createWriter(resume, fileSystemError); }
		fw.write(file);
	});
};

ViewModel.prototype.selectAndAddFiles = function() {
	this.addFiles(this.selectFiles());
}

ViewModel.prototype.deleteFile = function(file) {

};

ViewModel.prototype.downloadFile = function(file) {

};

ViewModel.prototype.compose = function() {
	var args = arguments;
	return function() {
		_.defer( _.compose.apply(this, args) );
	};
}


window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
waitfor(var fileSystem)	{ window.requestFileSystem( window.PERSISTENT, 1*1024*1024*1024 /* 1GB */, resume, fileSystemError); }
log.info("Got fileSystem");

// on chrome, we have to request the quota in another step before we're done
if(webkitStorageInfo) {
	waitfor() { webkitStorageInfo.requestQuota( webkitStorageInfo.PERSISTENT, 1*1024*1024*1024, resume, fileSystemError ); };
	log.info("Got quota");
}

var viewModel = new ViewModel(fileSystem);

ko.applyBindings(viewModel);