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

_.extend( File.prototype,
	{	read: function(cb) {
			var reader = new FileReader();
			reader.onloadend = function() { cb(this.result) };
			this.fileEntry().file(function(file){  reader.readAsBinaryString(file)  });
		}
	,	toURL: function() { return this.fileEntry().toURL(); }
	}
);

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
	this.components   = ko.observableArray();
	this.componentOptions = ko.observableArray();

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
				 		self.fileSystem().root.getFile( file.name, {}, function(f){  self.files.push(new File(self, f))  });
					}).fail( fileSystemError );
		})
	);
};

/**
 * Delete passed file from local storage.
 * @param  {FileEntry} fileEntry File to delete
 */
ViewModel.prototype.deleteFile = function(file) {
	var self = this;
	if(confirm("Delete file " + file.name() + "?")) {
		file.fileEntry().remove( function() {
			log.info("Deleted file " + file.name());
			self.files.remove(file);
		}, fileSystemError)
	}
};


ViewModel.prototype.addComponent = function(component) {
	this.components.push( new component() );
};

ViewModel.prototype.addFileComponent = function(file) {
	this.components.push( new FileComponent(file) );
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




var InputType = { SINGLE: {} };
var OutputType = { SINGLE: {} };

var Component = function(def) {
	var newComponent = function() {}
	_.extend( newComponent.prototype, Component.prototype, def );
	return newComponent;
};

_.extend( Component.prototype,
	{	nullo: ko.observable()

	,	MissingInput: {}

	,	init: function() { var self = this;

			self.inpins  = {};
			self.outpins = {};

			_.each(self.inputs, function(properties, name) {
				// do something with type eventually...
				self.inpins[name] = ko.observable(self.nullo);
			});

			if(self.setup) {
				self.setup();
			}

			self._options = {};
			_.each(self.options, function(properties, name) {
				self._options[name] = ko.observable();
				viewModel.componentOptions.push([name, self._options[name]])
			});

			_.each(self.outputs, function(properties, name) {
				var fn = _.isFunction(properties) ? properties : properties.fn;
				self.outpins[name] = ko.computed({
					read: _.bind(self._callOutputFn, self, fn)
				});
			})
		}

	,	connect: function(outputName, target, inputName) { var self = this;
			target.inpins[inputName]( this.outpins[outputName] );
			if(this.onConnection) this.onConnection(outputName, target, inputName);
		}

	,	disconnect: function(outputName, target, inputName) { var self = this;
			target.inpins[inputName]( this.nullo );
		}

	,	readInput: function(name, noThrow) { var self = this;
			var result = self.inpins[name]()();
			if(result === undefined && !noThrow) throw self.MissingInput;
			return result;
		}

	,	readOption: function(name) { var self = this;
			return self._options[name]();	
		}

	,	_callOutputFn: function(fn) {var self = this;
			try {
				return fn.apply(self, this.inpins);
			} catch(err) {
				console.log("caught", err);
				if(err === self.MissingInput) return undefined;
				throw err;
			}
		}

	, inputs: []
	, outputs: []
});

var FileComponent = function(file) {
	var self = this;

	self.name = file.name();
	self.file = file;
	self.data = ko.observable();
	self.file.read( function(data) {
		self.data(data);
	});

};

_.extend( FileComponent.prototype, Component.prototype,
	{	name: 'file'
	,	inputs: {}
	,	outputs: { 'data': function(){  return this.data()  }}
	}
);

components =
	[ new Component(
		{	name: 'Swap Bytes'
		,	description: 'Swap every pair of bytes. Ex: abcd -> badc'
		,	inputs: {'in': {}}
		,	outputs:
			{	'out':
				{	fn: function(inputs) {
						var bytes = this.readInput('in'), out = '';
						if(!bytes) return undefined;

						for(var i = 0; i < bytes.length; i += 2) {
							if(i+1 < bytes.length) out += bytes[i+1];
							out += bytes[i];
						}

						return out;
					}
				}
			}
		}
	)

	, new Component(
		{	name: 'Count Bits'
		,	description: 'Count the number of total, set, and unset bits.'
		,	inputs: {'in': {}}
		,	outputs:
			{	'total': function(){  return this.info().total  }
			,	'set':   function(){  return this.info().set    }
			,   'unset': function(){  return this.info().unset  }
			}
		,	setup: function() {
				this.info = ko.computed( {read: _.bind(this.calculate, this)} );
			}
		,	count: function(n) {
				n >>>= 0; // force uint32
				for(var pc = 0; n; n &= n - 1) ++pc;
				return pc;
			}
		,	calculate: function() {
				var bytes = this.readInput('in', true), total = 0, set = 0;
				if(!bytes) return {total: undefined, set: undefined, unset: undefined};
				for(var i =0; i < bytes.length; ++i) {
					total += 8;
					set += this.count(bytes.charCodeAt(i));
				}

				return { total: total, set: set, unset: total-set };
			}
		}
	)


	, new Component(
		{	name: 'Static Text'
		,	description: 'Always output static text'
		,	inputs: {}
		,	outputs: {'out': function() { return this.readOption('text') }}
		,	options: {'text': {}}
		}
	)

	, new Component(
		{	name: 'Log To Console'
		,	description: 'Log input to console'
		,	inputs: {'in': {}}
		,	outputs: {}
		,	setup: function() {
				var self = this;
				this.inpins['in'].subscribe(function(obs) {
					if(self.subscription) self.subscription.dispose();
					self.subscription = obs.subscribe(self.log);
					self.log( obs() );
				});
			}
		,	log: function(data) {
				if(data !== undefined) log.info(data);
			}
		}
	)

	, new Component(
		{	name: 'Tee'
		,	description: 'Duplicate input to multiple outputs'
		,	inputs: {'in': {}}
		,	outputs:
			{ 'out1': function(){ return this.readInput('in') }
			, 'out2': function(){ return this.readInput('in') }
			, 'out3': function(){ return this.readInput('in') }
			}
		}
	)
];




jsPlumb.importDefaults({
	Endpoint : ["Dot", {radius:6}],
	PaintStyle : { lineWidth: 2, strokeStyle: '#00ccff' },
	ConnectionOverlays : [
		[ "Arrow", { 
			location:1,
			id:"arrow",
			length:12,
			width: 8,
			foldback:0.1
		} ]
	]
});

jsPlumb.bind('jsPlumbConnection', function(info) {
	var sourceComponent = $(info.source).closest('.component').data('component');
	var targetComponent = $(info.target).closest('.component').data('component');

	sourceComponent.connect( $(info.source).text(), targetComponent, $(info.target).text() );
});

jsPlumb.bind('jsPlumbConnectionDetached', function(info) {
	var sourceComponent = $(info.source).closest('.component').data('component');
	var targetComponent = $(info.target).closest('.component').data('component');

	sourceComponent.disconnect( $(info.source).text(), targetComponent, $(info.target).text() );
});

ko.bindingHandlers.component = {
	init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
		var component = viewModel;
		jsPlumb.draggable( $(element), { containment: 'parent' } );

		component.init()
		$(element).data('component', component);

		_.defer(function() {
			$(element).find('ul.inputs li').each(function() {
				log.info("Making input ", this);
				jsPlumb.makeTarget( $(this), {
					anchor: 'LeftMiddle',
					maxConnections: 1,
					container: 'workPanel'
				});
			});
			$(element).find('ul.outputs li').each(function() {
				log.info("Making output ", this);
				jsPlumb.makeSource( $(this), {
					anchor: 'RightMiddle',
					maxConnections: 1,
					container: 'workPanel'
				});
			});
		});
	}
}