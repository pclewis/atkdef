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


	var Panel = new Class( "Panel",
		{	'__init__': function(self, name) {
				self.name = ko.observable(name);
				self.content = ko.observable();
			}
		}
	);


	var ConvertToBaseComponent = new Class("ConvertToBaseComponent", Component,
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

	var SimpleComponent = new Class("SimpleComponent", Component,
		{	__init__: function(self) {
				var getParamNames = function(func) { // from http://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically-from-javascript
					var funStr = func.toString();
					return funStr.slice(funStr.indexOf('(')+1, funStr.indexOf(')')).match(/([^\s,]+)/g);
				};

				var fns = _.objFilter(self._definition, function(v,k){   return _.isFunction(v) && k[0] !== '_'   })
				  , params = _(fns).chain().map(getParamNames).flatten().uniq().without('self').value()
				  ;

				self.inputs = _.object( params, _(params).map(function(){  return {}  }) );
				self.outputs = _(fns).objMap(function(fn) {
					return function() {
						var args = _.map(getParamNames(fn), function(pn){  return (pn==='self') ? self : self.readInput(pn)  });
						return fn.apply(self, args);
					};
				});
			}
		}
	);

	window.components =
		[ new Class(SimpleComponent,
			{	name: 'Swap Bytes'
			,	description: 'Swap every pair of bytes. Ex: abcd -> badc'
			,	out: function(self, bytes) {
					var out = "";

					for(var i = 0; i < bytes.length; i += 2) {
						if(i+1 < bytes.length) out += bytes[i+1];
						out += bytes[i];
					}

					return out;
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


		, new Class(SimpleComponent,
			{	name: 'Static Text'
			,	description: 'Always output static text'
			,	out: function(self) { return self.readOption('text') }
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

		, new Class(SimpleComponent,
			{	name: 'Toggle In'
			,	description: 'Toggle between two inputs'
			,	options: { 'toggle': 'checkbox' }
			,	out: function(self, in1, in2) {
						return self.readOption('toggle') ? in2 : in1;
				}
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

		, new Class(SimpleComponent,
			{	name: 'Descramble Bits'
			,	description: 'Descramble bits according to pattern'
			,	descramble: function(self, pattern, cipherText) {
					var out = "";
					for(var i = 0, pi = 0, pbi = 0x80; i < cipherText.length; ++i) {
						var b = cipherText.charCodeAt(i)
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

		, new Class(SimpleComponent,
			{	name: 'XOR'
			,	description: 'XOR inputs'
			,	out: function(self, in1, in2) {
					var out = '';
					for(var i = 0; i < in1.length && i < in2.length; ++i) {
						out += String.fromCharCode( in1.charCodeAt(i) ^ in2.charCodeAt(i) );
					}
					return out;
				}
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

		, new Class(ConvertToBaseComponent,
			{	name: 'bitstream'
			,	description: 'Show binary representation of data with no separators'
			,	base: 2
			,	spacers: {}
			}
		)

		, new Class(SimpleComponent,
			{	name: 'sort'
			,	description: 'Sort lines'
			,	'out': function(self, input){    return input.split("\n").sort().join("\n")    }
			}
		)

		, new Class(Component,
			{	name: 'uniq'
			,	description: 'Merge unique lines'
			,	out: function(self, input){    return _.uniq( input.split('\n'), true ).join("\n")    }
			}
		)

		, new Class(SimpleComponent,
			{	name: 'head'
			,	description: 'Remove all but first <lines> lines'
			,	options: {'lines': 'text'}
			,	'out': function(self, input){    return input.split("\n").slice( 0, parseInt(self.readOption('lines') || '5',10) ).join("\n")    }
			}
		)

		, new Class(SimpleComponent,
			{	name: 'tail'
			,	description: 'Remove all but last <lines> lines'
			,	options: {'lines': 'text'}
			,	out: function(self, input){    return input.split("\n").slice( 0 - parseInt(this.readOption('lines') || '5',10) ).join("\n")    }
			}
		)

		, new Class(SimpleComponent,
			{	name: 'Bit Frequency'
			,	description: 'Return count of how often each bit is set or unset'
			,	options: {'bits': 'text'}
			,	out: function(self, input) {
					var bits = parseInt(self.readOption('bits') || '8', 10)
					  , bytes = bits/8
					  , counts = [];

					if(bits < 8) return "minimum 8 bits";
					if((bits % 8) !== 0) return "must be divisible by 8";

					for(var i = 0; i < input.length; ++i) {
						var c = input.charCodeAt(i);
						for(var bit = 0; bit < 8; ++bit) {
							var mask = 1 << bit
							  , ci = (i % bytes)*8 + (7-bit)
							  , countObj = counts[ci] || {0:0, 1:0};
							if(c & mask) countObj[1]++;
							else countObj[0]++;
							counts[ci] = countObj;
						}
					}

					return _(counts).map(function(c,i){   return "bit " + i + ":\t" + c[0] + "\t" + c[1]   }).join("\n");
				}
			}
		)

		, new Class(SimpleComponent,
			{	name: 'Transpose Bits'
			,	description: 'Transform MxN bit matrix to NxM matrix'
			,	options: {'cols': 'text'}
			,	out: function(self, input) {
					var cols = parseInt( self.readOption('cols') || '8', 10 )
					  , m = cols/8
					  , n = input.length/cols
					  , target = new Array(input.length);

					for(var mi = 0; mi < m; mi++) {
						for(var ni = 0; ni < n; ni++) {
							self._transpose8( input, ni*m*8+mi, m, n, target, mi*n*8+ni );
						}
					}

					return target.join('');
				}
			,	_transpose8: function(self, A, Ai, m, n, B, Bi) { // from Hacker's Delight
					var x = (A.charCodeAt(Ai+0*m) << 24) | (A.charCodeAt(Ai+1*m) << 16) | (A.charCodeAt(Ai+2*m)<<8) | (A.charCodeAt(Ai+3*m))
					  , y = (A.charCodeAt(Ai+4*m) << 24) | (A.charCodeAt(Ai+5*m) << 16) | (A.charCodeAt(Ai+6*m)<<8) | (A.charCodeAt(Ai+7*m))
					  , t = 0
					  ;

					t = (x ^ (x >> 7)) & 0x00AA00AA;  x = x ^ t ^ (t << 7);
					t = (y ^ (y >> 7)) & 0x00AA00AA;  y = y ^ t ^ (t << 7);

					t = (x ^ (x >>14)) & 0x0000CCCC;  x = x ^ t ^ (t <<14);
					t = (y ^ (y >>14)) & 0x0000CCCC;  y = y ^ t ^ (t <<14);

					t = (x & 0xF0F0F0F0) | ((y >> 4) & 0x0F0F0F0F);
					y = ((x << 4) & 0xF0F0F0F0) | (y & 0x0F0F0F0F);
					x = t;

					B[Bi+0*n] = String.fromCharCode((x>>24)&0xFF); B[Bi+1*n] = String.fromCharCode((x>>16)&0xFF); B[Bi+2*n] = String.fromCharCode((x>>8)&0xFF); B[Bi+3*n] = String.fromCharCode((x>>0)&0xFF);
					B[Bi+4*n] = String.fromCharCode((y>>24)&0xFF); B[Bi+5*n] = String.fromCharCode((y>>16)&0xFF); B[Bi+6*n] = String.fromCharCode((y>>8)&0xFF); B[Bi+7*n] = String.fromCharCode((y>>0)&0xFF);
				}
			}
		)

		, new Class(SimpleComponent,
			{	name: 'Repeat Finder'
			,	description: 'Find repeated pattern'
			,	options:
				{	fuzz: {type: 'number', default: 30}
				,	minRepeats: {type: 'number', default: 1}
				,	minLength: {type: 'number', default: 1}
				,	maxDistance: { type: 'number', default: 0}
				,	bounded: {type: 'checkbox', default: true}
				}
			,	out: function(self, input) {
					var fuzz    = self.readOption('fuzz')
					  , mr      = self.readOption('minRepeats')
					  , ml      = self.readOption('minLength')
					  , md      = self.readOption('maxDistance')
					  , bounded = self.readOption('bounded')
					  , pattern = (bounded ? '^' : '') + '.{0,'+fuzz+'}?((.{' + ml + ',}?)(.{0,' + md + '}\\2){' + mr + ',}).{0,'+fuzz+'}?' + (bounded ? '$' : '')
					  , result  = (new RegExp(pattern)).exec(input);
					if(!result) return "No pattern found.";
					else return "Pattern of length " + result[2].length + " repeated " + (result[1].length / result[2].length) + " times starting at index " + input.indexOf(result[2]) + ":\n\n" + result[2];
				}
			}
		)

		, new Class(SimpleComponent,
			{	name: 'selfxor'
			,	description: "Output a sequence XOR'd with itself"
			,	options:
				{	sections: { type: 'number', default: 3}
				,	firstOnly: { type: 'checkbox', default: false, description: "XOR each block against first."}
				}
			,	_xorStrings: function(self, x, y) {
					var out = '';
					for(var i = 0; i < x.length; ++i) {
						out += String.fromCharCode( x.charCodeAt(i) ^ y.charCodeAt(i) );
					}
					return out;
				}
			,	out: function(self, input) {
					var sections = self.readOption('sections')
					  , firstOnly = self.readOption('firstOnly')
					  , blockSize = input.length / sections
					  , prevBlock = input.substr(0, blockSize)
					  , out = ''
					  ;
					for(var i = blockSize; i < input.length; i += blockSize) {
						var curBlock = input.substr( i, blockSize );
						out += self._xorStrings( prevBlock, curBlock );
						if (!firstOnly) prevBlock = curBlock;
					}
					return out;
				}
			}
		)

		, new Class(SimpleComponent,
			{	name: 'Divide'
			,	description: 'divide'
			,	quotient: function(self, numerator, denominator) {
					return parseInt(numerator, 10) / parseInt(denominator, 10);
				}
			}
		)

		, new Class(SimpleComponent,
			{	name: 'Block'
			,	description: 'Extract single block'
			,	options:
				{	'blockSize': {type: 'text', default: '0x1E00'}
				,	'block':     {type: 'number', default: 0}
				}
			,	block: function(self, input) {
					var blockSize = parseInt( self.readOption('blockSize') )
					  , block = parseInt( self.readOption('block'), 10 )
					  ;
					return input.substr(block*blockSize, blockSize);
				}
			}
		)

		, new Class(SimpleComponent,
			{	name: 'Bit Deinterleave'
			,	description: 'Split even and odd bytes into separate streams'
			,	_evenBits: function(self, x) {
					x >>>= 0; // force uint32
					x = x & 0x55555555;
					x = (x | (x >> 1)) & 0x33333333;
					x = (x | (x >> 2)) & 0x0F0F0F0F;
					x = (x | (x >> 4)) & 0x00FF00FF;
					x = (x | (x >> 8)) & 0x0000FFFF;
					return x;
				}
			,	_bits: function(self, input, odd) {
					var out = '';
					if ((input.length % 2) === 1) log.warn("Bit Deinterleave: length is odd");
					for(var i = 0; i < input.length; i += 2) {
						// FIXME what happens when input.length is odd?
						var x = (input.charCodeAt(i) << 8) | input.charCodeAt(i+1);
						out += String.fromCharCode(self._evenBits(x >> odd));
					}
					return out;
				}
			,	even: function(self, input) {  return self._bits(input, 0)  }
			,	odd:  function(self, input) {  return self._bits(input, 1)  }
			}
		)

		, new Class(SimpleComponent,
			{	name: 'Bit Reverse'
			,	description: 'Reverse the bits in each byte.'
			,	_reverseByte: function(self, b) {
					return (((b * 0x0802 & 0x22110) | (b * 0x8020 & 0x88440)) * 0x10101 >> 16) & 0xFF;
				}
			,	reversed: function(self, input) {
					var out = '';
					for(var i = 0; i < input.length; ++i) {
						out += String.fromCharCode( self._reverseByte(input.charCodeAt(i)) );
					}
					return out;
				}
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

					self.options.name.value.subscribe(function(value) {
						self.panel.name( ko.utils.unwrapObservable(value) );
					});
				}
			,	updatePanel: function(self, data) {
					self.panel.content(data);
				}
			,	destroy: function(self) {
					viewModel.panels.remove(self.panel); /* HACK */
				}
			}
		)

		, new Class(Component,
			{	name: 'Window'
			,	description: 'Show data in a window.'
			,	inputs: {'in': {}}
			,	options: {'title': 'text'}
			,	setup: function(self) {
					self.window = window.open('', '_blank', 'location=no,menubar=no,status=no,titlebar=no,toolbar=no' );
					self.window.document.write("<pre></pre>");
					self.inpins['in'].subscribe(function(obs) {
						if(self.subscription) self.subscription.dispose();
						self.subscription = obs.subscribe(_.bind(self.updatePanel,self));
						self.updatePanel( obs() );
					});
					self.options.title.value.subscribe(function(value) {
						self.window.document.title = ko.utils.unwrapObservable(value);
					});
				}
			,	updatePanel: function(self, data) {
					self.window.document.body.firstChild.innerText = data;
				}
			,	destroy: function(self) {
					self.window.close();
				}
			}
		)

		, require('atk/components/fileComponent')

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

			_(targetComponent.connections).each( function(connections, pin) {
				_(connections).each( function(connection) {
					updateConnectionColors( targetComponent, pin, connection.target, connection.type );
				});
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

			jsPlumb.draggable( $(element), { stop: function(event, ui) {
				if(ui.position.top < 0 || ui.position.left < 0) {
					jsPlumb.selectEndpoints( {element: $(element).find('li')} ).delete();
					// HACK for http://code.google.com/p/jsplumb/issues/detail?id=302
					var ep = jsPlumb.getTestHarness().endpointsByElement;
					for(var k in ep) { if (ep.hasOwnProperty(k) && ep[k].length === 0) delete ep[k]; }
					bindingContext.$root.components.remove(component);
					component.destroy();
				}
			}} );

		}
	};

	var makeOptionPinAnchor = function() { return jsPlumb.makeDynamicAnchor( ['LeftMiddle', 'RightMiddle', 'TopCenter'], function(xy, wh, txy, twh, anchors) {
		//log.debug( xy, wh, txy, twh );
		if(wh[0] <= 5 || wh[1] <= 5) return anchors[2]; // BottomCenter
		if( txy[0] + twh[0]/2 <= xy[0] + wh[0]/2 ) return anchors[0];
		return anchors[1];
	})};

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
						maxConnections: -1,
						container: 'tab_design'
					});
					break;

				case 'option':
					jsPlumb.makeTarget( $(element), {
						anchor: makeOptionPinAnchor(),
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

	// this is kind of ridiculous and probably only has one real use case.. should maybe just have something like unwindValue and unwindChecked
	ko.bindingHandlers.unwind = {
		init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
			_(valueAccessor()).each(function(v, chain) {
				var obs
				  , obsA = function() { return obs } // have to wrap the observable in an valueAccessor-like function
				  ;

				if (chain.indexOf('_if_writeable') > -1) {
					chain = chain.substr(0, chain.indexOf('_if_writeable'));
					obs = ko.computed( function() {
						return ko.isWriteableObservable( unwindObservable(v) );
					});
				} else {
					obs = ko.computed(
						{	read: function(){ return unwindObservable(v)(); }
						,	write: function(nv) { unwindObservable(v)(nv); }
						}
					);
				}

				// we won't ever get updated since we're handed a static map, so manage delegated updates manually
				obs.subscribe(function(){
					if(ko.bindingHandlers[chain].update)
						return ko.bindingHandlers[chain].update.call(this, element, obsA, allBindingsAccessor, viewModel, bindingContext);
				});

				if(ko.bindingHandlers[chain].init)
					return ko.bindingHandlers[chain].init.call(this, element, obsA, allBindingsAccessor, viewModel, bindingContext);
				return undefined;
			});
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