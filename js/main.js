requirejs.config(
	{	baseUrl: 'js/lib'
	,	paths:
		{	atk: '../'
		,	jquery: 'jquery.min'
		,	'jquery.xcolor': 'jquery.xcolor.min'
		,	'jquery-ui': 'jquery-ui.min'
		,	underscore: 'underscore-min'
		,	knockout: 'knockout-min'
		,	jsPlumb: 'jquery.jsPlumb-1.3.16-all-min'
		}
	, shim:
		{	'underscore':
			{	'exports': '_'
			}

		,	'underscore.objMapFunctions': ['underscore']
		,	'underscore.partial': ['underscore']
		,	'jquery.xcolor': ['jquery']

		,	'jsPlumb':
			{	'deps': ['jquery', 'jquery-ui']
			,	'exports': 'jsPlumb'
			}
		}
	//, urlArgs: "bust=" +  (new Date()).getTime()
	}
);

define( "main", function(require) { /*['jquery', 'underscore', 'knockout', 'jsPlumb', 'atk/log', 'atk/file'], function($, _, ko, jsPlumb, log, File) {*/

	var $         = require('jquery')
	  , _         = require('underscore')
	  , ko        = require('knockout')
	  , jsPlumb   = require('jsPlumb')
	  , log       = require('atk/log')
	  , Component = require('atk/component')
	  , Class     = require('atk/class')
	  , ViewModel = require('atk/viewModel')
	  ;

	require('underscore.partial');
	require('jquery.xcolor');

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
		if(window.webkitStorageInfo) {
			return $.Deferred(function(d) { window.webkitStorageInfo.requestQuota( window.webkitStorageInfo.PERSISTENT, 1*1024*1024*1024, d.resolve, d.reject );  });
		}
	}).done(function() {
		log.info("Got quota");
		ko.applyBindings(viewModel);
	});


	var Panel = new Class(
		{	'__init__': function(self, name) {
				self.name = ko.observable(name);
				self.content = ko.observable();
			}
		}
	);


	var ConvertToBaseComponent = new Class(Component,
			{	inputs: {'in': {}}
			,	outputs: {'out': function(){   return this.converted()   }}
			,	createWorker: function(self) {
					self.worker = new Worker('js/workers/convertToBase.js');
					self.worker.onmessage = function(e) { self.cb(e.data) };
				}
			,	setup: function(self) {
					self.createWorker();
					self.converted = ko.computed(function(){  return self.readInput('in', true)  }).extend({deferred: function(input, cb) {
						if(input === undefined) {
							_.defer(cb);
							return;
						}
						if(self.cb) { // cancel old worker
							self.worker.terminate();
							self.createWorker();
						}
						self.cb = cb;
						self.worker.postMessage({ data: input, base: self.base, spacers: self.spacers, maxLength: self.maxLength });
					}});
				}
			,	maxLength: 0x1E00
			}
		);

	window.components =
		[ new Class(Component,
			{	name: 'Swap Bytes'
			,	description: 'Swap every pair of bytes. Ex: abcd -> badc'
			,	inputs: {'in': {}}
			,	outputs:
				{	'out':
					{	fn: function() {
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

		, new Class(Component,
			{	name: 'Count Bits'
			,	description: 'Count the number of total, set, and unset bits.'
			,	inputs: {'in': {}}
			,	outputs:
				{	'total': function(){  return this.info().total  }
				,	'set':   function(){  return this.info().set    }
				,   'unset': function(){  return this.info().unset  }
				}
			,	setup: function(self) {
					self.info = ko.computed( self.calculate, self );
				}
			,	count: function(self, n) {
					n >>>= 0; // force uint32
					for(var pc = 0; n; n &= n - 1) ++pc;
					return pc;
				}
			,	calculate: function(self) {
					var bytes = self.readInput('in', true), total = 0, set = 0;
					if(!bytes) return {total: undefined, set: undefined, unset: undefined};
					for(var i =0; i < bytes.length; ++i) {
						total += 8;
						set += self.count(bytes.charCodeAt(i));
					}

					return { total: total, set: set, unset: total-set };
				}
			}
		)


		, new Class(Component,
			{	name: 'Static Text'
			,	description: 'Always output static text'
			,	inputs: {}
			,	outputs: {'out': function() { return this.readOption('text') }}
			,	options: {'text': 'text'}
			}
		)

		, new Class(Component,
			{	name: 'Log To Console'
			,	description: 'Log input to console'
			,	inputs: {'in': {}}
			,	outputs: {}
			,	options: {'prefix': 'text'}
			,	setup: function(self) {
					self.inpins['in'].subscribe(function(obs) {
						if(self.subscription) self.subscription.dispose();
						self.subscription = obs.subscribe(_.bind(self.log,self));
						self.log( obs() );
					});
				}
			,	log: function(self, data) {
					if(data !== undefined) {
						var prefix = self.readOption('prefix') || '';
						log.info(prefix + data);
					}
				}
			}
		)

		, new Class(Component,
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

		, new Class(Component,
			{	name: 'Toggle In'
			,	description: 'Toggle between two inputs'
			,	inputs: {'in1': {}, 'in2': {}}
			,	outputs:
				{	'out': function() {
						if(this.readOption('toggle'))
							return this.readInput('in2');
						else
							return this.readInput('in1');
					}
				}
			,	options:
				{	'toggle': 'checkbox'	}
			}
		)

		, new Class(Component,
			{	name: 'Toggle Out'
			,	description: 'Toggle between two outputs'
			,	inputs: {'in': {}}
			,	outputs:
				{	'out1': function() {   if(!this.readOption('toggle')) return this.readInput('in')   }
				,	'out2': function() {   if( this.readOption('toggle')) return this.readInput('in')   }
				}
			,	options:
				{	'toggle': 'checkbox'	}
			}
		)

		, new Class(Component,
			{	name: 'Toggle'
			,	description: 'Toggle between two states'
			,	inputs: {}
			,	outputs:
				{	'out1': function() {   return this.readOption('toggle')   }
				,	'out2': function() {   return this.readOption('toggle')   }
				,	'out3': function() {   return this.readOption('toggle')   }
				}
			,	options:
				{	'toggle': 'checkbox'	}
			}
		)


		, new Class(Component,
			{	name: 'Decode Bit Scramble'
			,	description: 'Determine bit scramble pattern using plaintext'
			,	inputs: {'plain': {}, 'cipher': {}}
			,	outputs:
				{	'pattern': function(){   return this.decodePattern()   }
				,	'error': function(){     return this.error()           }
				}
			,	setup: function(self) {
					self.error = ko.observable();

				}
			,	decodePattern: function(self) {
					var scramblePattern = ""
					  , blockSize = 0x1E00 // todo: make an option
					  , plaintext = self.readInput('plain')
					  , ciphertext = self.readInput('cipher')
					  ;
					for(var i = 0; i < blockSize; i += 2) {
						var scrambled = 0;
						for(var bit = 0x8000, scrbit = 0x80; bit > 0; bit >>= 2, scrbit >>= 1) {
							var x0 = true, x1 = true, sx0 = true, sx1 = true, sb = bit >> 1;
							for(var j = i; j < plaintext.length-1; j += blockSize) {
								var pt = (plaintext.charCodeAt(j) << 8) + plaintext.charCodeAt(j+1)
								  , ct = (ciphertext.charCodeAt(j) << 8) + ciphertext.charCodeAt(j+1)
								  ;
								    //ct = ciphertext.charCodeAt(j) + (ciphertext.charCodeAt(j+1) << 8)
								if((pt & bit) === (ct & bit)) x1 = false;
								else x0 = false;
								if(((pt & bit)>>1) === (ct & sb)) sx1 = false;
								else sx0 = false;
							}
							if(!x0 && !x1)
								scrambled |= scrbit;
							if(x0 + x1 + sx0 + sx1 > 1) {
								self.error("Multiple key bits @ index " + i + " bit: " + bit);
							}
							if(x0 + x1 + sx0 + sx1 < 1) {
								self.error("No key bit @ index " + i + " bit: " + bit);
							}
						}

						scramblePattern += String.fromCharCode( scrambled );
					}

					return scramblePattern;
				}
			}
		)

		, new Class(Component,
			{	name: 'Descramble Bits'
			,	description: 'Descramble bits according to pattern'
			,	inputs: {'cipher': {}, 'pattern': {}}
			,	outputs: {'out': function(){   return this.descramble()   }}
			,	descramble: function(self) {
					var data    = self.readInput('cipher')
					  , pattern = self.readInput('pattern')
					  , out     = ""
					  ;
					for(var i = 0, pi = 0, pbi = 0x80; i < data.length; ++i) {
						var b = data.charCodeAt(i)
						  , p = pattern.charCodeAt(pi);

						for(var tb = 0x80; tb; tb >>= 2) {
							// if pattern bit is set, zero out the two target bits and then or them back in swapped. straightforward but probably not optimal.
							if(p&pbi) b = ((b&~tb)&~(tb>>1)) | ((b&tb)>>1) | ((b&(tb>>1))<<1);
							pbi >>= 1;
						}
						out += String.fromCharCode(b);
						if(pbi===0) {
							++pi;
							pbi=0x80;
						}
						if(pi >= pattern.length) {
							pi = 0;
						}
					}

					return out;
				}
			}
		)

		, new Class(Component,
			{	name: 'XOR'
			,	description: 'XOR inputs'
			,	inputs: {'in1': {}, 'in2': {}}
			,	outputs: {'out': function() {
					var a = this.readInput('in1'), b = this.readInput('in2'), out = '';
					for(var i = 0; i < a.length && i < b.length; ++i) {
						out += String.fromCharCode( a.charCodeAt(i) ^ b.charCodeAt(i) );
					}

					return out;
				}}
			}
		)

		, new Class(ConvertToBaseComponent,
			{	name: 'hexdump'
			,	description: 'Show hex representation of data'
			,	base: 16
			}
		)

		, new Class(ConvertToBaseComponent,
			{	name: 'bindump'
			,	description: 'Show binary representation of data'
			,	base: 2
			,	spacers: {1: {0: ' '}, 8: {0: '\n'}}
			}
		)

		, new Class(Component,
			{	name: 'sort'
			,	description: 'Sort lines'
			,	inputs: {'in': {}}
			,	outputs: {'out': function() {
					return this.readInput('in').split("\n").sort().join("\n");
				}}
			}
		)

		, new Class(Component,
			{	name: 'uniq'
			,	description: 'Merge unique lines'
			,	inputs: {'in': {}}
			,	outputs: {'out':function() {
					return _.uniq( this.readInput('in').split('\n'), true ).join("\n");
				}}
			}
		)

		, new Class(Component,
			{	name: 'head'
			,	description: 'Remove all but first <lines> lines'
			,	options: {'lines': 'text'}
			,	inputs: {'in': {}}
			,	outputs: {'out':function() {
					return this.readInput('in').split("\n").slice( 0, parseInt(this.readOption('lines') || '5',10) ).join("\n");
				}}
			}
		)

		, new Class(Component,
			{	name: 'tail'
			,	description: 'Remove all but last <lines> lines'
			,	options: {'lines': 'text'}
			,	inputs: {'in': {}}
			,	outputs: {'out':function() {
					return this.readInput('in').split("\n").slice( 0 - parseInt(this.readOption('lines') || '5',10) ).join("\n");
				}}
			}
		)

		, new Class(Component,
			{	name: 'Panel'
			,	description: 'Show data in a panel.'
			,	inputs: {'in': {}}
			,	options: {'name': 'text'}
			,	setup: function(self) {
					self.panel = new Panel('Panel');
					viewModel.panels.push(self.panel); /* HACK */
					self.inpins['in'].subscribe(function(obs) {
						if(self.subscription) self.subscription.dispose();
						self.subscription = obs.subscribe(_.bind(self.updatePanel,self));
						self.updatePanel( obs() );
					});

					self.options.name.subscribe(function(value) {
						self.panel.name( ko.utils.unwrapObservable(value) );
					});
				}
			,	updatePanel: function(self, data) {
					self.panel.content(data);
				}
			}
		)

		, new Class(Component,
			{	name: 'Window'
			,	description: 'Show data in a window.'
			,	inputs: {'in': {}}
			,	setup: function(self) {
					self.window = window.open('', '_blank', 'location=no,menubar=no,status=no,titlebar=no,toolbar=no' );
					self.window.document.write("<pre></pre>");
					self.inpins['in'].subscribe(function(obs) {
						if(self.subscription) self.subscription.dispose();
						self.subscription = obs.subscribe(_.bind(self.updatePanel,self));
						self.updatePanel( obs() );
					});
				}
			,	updatePanel: function(self, data) {
					self.window.document.body.firstChild.innerText = data;
				}
			}
		)

	];


	var baseColors = $.xcolor.tetrad('#00CCFF');

	jsPlumb.importDefaults(
		{	Endpoint: ["Dot", {radius:6}]
		//,	Connector: [ "Bezier", {curviness: 100} ]
		//,	Connector : "Flowchart"
		,	PaintStyle:
			{	lineWidth: 2
			,	strokeStyle: '#00ccff'
			//,	outlineColor : '#0D161A'
			//,	outlineWidth : 1
			, outlineColor: '#000000'
			, outlineWidth: 1
			}
		, ConnectionOverlays:
			[	[	"Arrow",
				{	location: 1
				,	length: 12
				,	width: 8
				,	foldback: 0.2
				}
				]
			]
	});

	function getBaseColor(component, pin) {
		var base = baseColors[ parseInt(component.id.slice(1), 10) % baseColors.length ]
		  , colors = $.xcolor.splitcomplement(base);

		return colors[ _.indexOf(_.keys(component.outpins), pin) % colors.length ];
	}

	function updateConnectionColors(sourceComponent, sourcePin, targetComponent, targetPinType) {
		var pinId           = sourceComponent.id + '_output_' + sourcePin /* FIXME duped calculation, make this a function */
		  , sourceColors    = _.values(sourceComponent.colors || {x: getBaseColor(sourceComponent, sourcePin)})
		  , sourceColor     = _.reduce( sourceColors.slice(1), $.xcolor.average, $.xcolor.average(sourceColors[0], sourceColors[0]) ).getHex()
		  , targetColorMap  = targetComponent.colors || {}
		  ;

		jsPlumb.select( {source: pinId} ).setPaintStyle( _.defaults({strokeStyle: sourceColor}, jsPlumb.Defaults.PaintStyle));

		if(targetPinType === 'input') {
			targetColorMap[sourceComponent.id] = sourceColor;
			targetComponent.colors = targetColorMap;

			_.each(targetComponent.connections, function(connection, pin) {
				updateConnectionColors( targetComponent, pin, connection.target, connection.type );
			});
		}
	}

	jsPlumb.bind('jsPlumbConnection', function(info) {
		var sourceComponent = $(info.source).data('component')
		  , targetComponent = $(info.target).data('component')
		  , sourcePin       = $(info.source).data('pin-name')
		  , targetPin       = $(info.target).data('pin-name')
		  , targetType      = $(info.target).data('pin-type')
		  ;

		log.info( "Connection", sourceComponent, targetComponent, sourcePin, targetPin, targetType );

		sourceComponent.connect( sourcePin, targetComponent, targetPin, targetType );

		updateConnectionColors( sourceComponent, sourcePin, targetComponent, targetType );
	});

	jsPlumb.bind('jsPlumbConnectionDetached', function(info) {
		var sourceComponent = $(info.source).data('component')
		  , targetComponent = $(info.target).data('component')
		  , sourcePin       = $(info.source).data('pin-name')
		  , targetPin       = $(info.target).data('pin-name')
		  , targetType      = $(info.target).data('pin-type')
		  ;

		log.info( "Disconnection", sourceComponent, targetComponent, sourcePin, targetPin, targetType );

		if(sourceComponent) sourceComponent.disconnect( sourcePin, targetComponent, targetPin, targetType );
	});

	ko.bindingHandlers.component = {
		init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
			var component = viewModel;

			component.init();
			component.element = element; /* HACK */
			element.id = component.id;
			$(element).data('component', component);
			bindingContext.component = component;

			jsPlumb.draggable( $(element), { containment: 'parent' } );

		}
	};

	var optionPinAnchor = jsPlumb.makeDynamicAnchor( ['LeftMiddle', 'RightMiddle', 'TopCenter'], function(xy, wh, txy, twh, anchors) {
		//log.debug( xy, wh, txy, twh );
		if(wh[0] <= 5 || wh[1] <= 5) return anchors[2]; // BottomCenter
		if( txy[0] + twh[0]/2 <= xy[0] + wh[0]/2 ) return anchors[0];
		return anchors[1];
	});

	ko.bindingHandlers.componentPin = {
		init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
			var component = bindingContext.component
			  , properties = valueAccessor();

			element.id = component.id + "_" + properties.type + "_" + properties.name;
			log.debug( "Making " + properties.type + " pin for component: ", component );

			$(element).data('pin-type', properties.type);
			$(element).data('pin-name', properties.name);
			$(element).data('component', component);

			switch(properties.type) {
				case 'input':
					jsPlumb.makeTarget( $(element), {
						anchor: 'LeftMiddle',
						maxConnections: 1,
						container: 'tab_design'
					});
					break;

				case 'output':
					jsPlumb.makeSource( $(element), {
						anchor: 'RightMiddle',
						maxConnections: 1,
						container: 'tab_design'
					});
					break;

				case 'option':
					jsPlumb.makeTarget( $(element), {
						anchor: optionPinAnchor,
						maxConnections: 1,
						container: 'tab_design'
					});
					break;
			}
		}
	};

	function unwindObservable(v) {
		while (ko.isObservable(v())) { v = v() }
		return v;
	}

	ko.bindingHandlers.componentOption = {
		init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
			var type = valueAccessor().type
			  , chain = (type === 'checkbox') ? 'checked' : 'value'
			  ;
			element.type = type;

			return ko.bindingHandlers[chain].init.call(this, element, _.partial(unwindObservable, valueAccessor), allBindingsAccessor, viewModel, bindingContext);
		},

		update: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
			var chain = (element.type === 'checkbox') ? 'checked' : 'value'
			  ;
			return ko.bindingHandlers[chain].update.call(this, element, _.partial(unwindObservable, valueAccessor), allBindingsAccessor, viewModel, bindingContext);
		}
	};

	$(document).ready( function() {
		$('.tabbed .tabs').delegate('a', 'click', function(e) {
			e.preventDefault();
			$(e.target).closest('.tabs').find('.selected').removeClass('selected');
			$(e.target).closest('li').addClass('selected');
			$(e.target).closest('.tabbed').children('div:visible').hide();
			$(e.target.href.substring(e.target.href.indexOf('#'))).show();
		});
	});
});

requirejs(["main"]);