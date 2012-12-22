define(function(require) {
	var _     = require('underscore')
	  , ko    = require('knockout')
	  , Class = require('atk/class')
	  , log   = require('atk/log')
	  , File  = require('atk/file')
	  , FileComponent = require('atk/components/fileComponent')
	  , jsPlumb = require('jsPlumb') /* FIXME */
	  , DESIGN_STORAGE_PREFIX = "atk.designs."
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
		}

		log.error('FileSystem Error: ' + msg);
		throw e;
	}

	return new Class(
		{	__init__: function(self) {
				self.fileSystem       = ko.observable();
				self.selectedFile     = ko.observable(); // File  // idea: .contract extender to enforce types/etc...
				self.files            = ko.observableArray();
				self.fileFilter       = ko.observable();
				self.components       = ko.observableArray();
				self.componentOptions = ko.observableArray();
				self.savedDesigns     = ko.observableArray( _.chain(localStorage).keys().filter(function(s){  return s.indexOf(DESIGN_STORAGE_PREFIX) === 0  }).map(function(s){ return s.substr(DESIGN_STORAGE_PREFIX.length)  }).value() );
				self.selectedDesign   = ko.observable();
				self.panels           = ko.observableArray();

				self.fileNameRegexCipherText = ko.observable( /^(.*)\.dat$/i );
				self.fileNameRegexPlainText  = ko.observable( /^(.*)\.(bin|dat)\.mp3$/i );


				self.fileSystem.subscribe( function(fileSystem){
					self.files.removeAll();
					fileSystem.root.createReader().readEntries(function(entries){
						self.files.push.apply(self.files,
							_(entries).map(function(e){  return new File(self, e)  })
						);
					});
				});
			}

		/**
		 * Show a multi-file selection dialog box.
		 * NOTE: If Cancel is pressed, no resolution will ever happen.
		 *
		 * @todo fail previous promise when opening a new one? there can only be one up at a time...
		 * @resolve {[File]} when files are selected
		 */
		,	selectFiles: function(self) {
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
			}

		/**
		 * Copy passed files into the local storage.
		 * @param {[File]} files List of files to add.
		 * @resolve When all files are added.
		 */
		,	addFiles: function(self, files) {
				// TODO: ask to overwrite?
				return $.when(
					_.map(files, function(file) {
						log.info("Creating " + file.name);
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
			}

		/**
		 * Delete passed file from local storage.
		 * @param  {FileEntry} fileEntry File to delete
		 */
		,	deleteFile: function(self, file) {
				if(confirm("Delete file " + file.name() + "?")) {
					file.fileEntry().remove( function() {
						log.info("Deleted file " + file.name());
						self.files.remove(file);
					}, fileSystemError);
				}
			}


		,	addComponent: function(self, component) {
				self.components.push( new component() );
			}

		,	alternateFile: function(self, file) {
				return _.find(self.files(), function(f) {
					return (f !== file && f.baseName().toLowerCase() === file.baseName().toLowerCase());
				});
			}

		,	addFileComponent: function(self, file) {
				self.components.push( new FileComponent(file, self.alternateFile(file)) );
			}

		/**
		 * compose potentially deferred method calls on the viewmodel.
		 * compose( f, g, x ) returns a function which returns a deferred which will pass the result of f(g(x)) when finished.
		 * each function converted to a deferred and piped in order, ex: x().pipe(g).pipe(f)
		 * note: 'this' will be the viewmodel instance in each function.
		 */
		,	compose: function(self) {
				var fns = _.toArray(arguments).slice(1); // cut self off

				return function() {
					var start = new $.Deferred()
					  , composed = _.reduceRight( fns, function(d, f) {
							return d.pipe(function(){  return $.when( f.apply(self, arguments) )  });
						}, start );
					start.resolve();
					return composed;
				};
			}

		,	saveDesign: function(self, name) {
				localStorage[ DESIGN_STORAGE_PREFIX + name ] = self.serializeDesign();
				if( !_.contains(self.savedDesigns(), name) ) {
					self.savedDesigns.push( name );
				}
			}

		,	loadDesign: function(self, name) {
				self.deserializeDesign( localStorage[ DESIGN_STORAGE_PREFIX + name ] );
			}

		,	deleteDesign: function(self, name) {
				delete localStorage[ DESIGN_STORAGE_PREFIX + name ];
				self.savedDesigns.remove(name);
			}

		,	serializeDesign: function(self) {
				return JSON.stringify( {components: _.map(self.components(), _.bind(self.serializeComponent, self))} );
			}

		,	serializeConnection: function(self, connection) {
				return {	target: connection.target.id
					   ,	type: connection.type
					   ,	pin: connection.pin
					   };
			}
		,	serializeComponent: function(self, component) {
				return {	id: component.id
					   ,	name: component.name
					   ,	pos: $(component.element).position()
					   ,	connections: _.objMap(component.connections, self.serializeConnection)
					   ,	options: _.objMap(component.options, function(v) { return v(); })
					   };
			}

		,	deserializeDesign: function(self, str) {
				var obj = JSON.parse(str);
				self.components.removeAll();
				jsPlumb.deleteEveryEndpoint();

				_.each( obj.components, function(component) {
					var cc = _.find(window.components, function(c){   return (c.prototype.name === component.name)   }), ci;
					if(cc === undefined) {
						var f = _.find(self.files(), function(c){   return (c.baseName() === component.name || c.name() === component.name)   });
						if(f === undefined) {
							throw "Can't load: missing component: " + component.name;
						}
						var alt = self.alternateFile(f);
						ci = new FileComponent(f, alt);
					} else {
						ci = new cc();
					}
					ci.id = component.id;
					self.components.push( ci );

					_.defer(function(){
						$('#' + component.id).css(component.pos);
						_.each(component.options, function(v, k) {
							ci.options[k](v);
						});
						_.defer( function() { // double-defer so everything will be in position before we connect
							_.each( component.connections, function(conn, name) {
								var type = conn.type || 'input';
								ci.connect( name, $('#' + conn.target).data('component'), conn.pin, type );
								jsPlumb.connect(
								{	source: $('#' + component.id + '_output_' + name)
								,	target: $('#' + conn.target + '_' + type + '_' + conn.pin)
								});
							});
						});
					});
				});
			}
		}
	);
});