// underscore.partial.js from https://gist.github.com/1629491
// Underscore mixing for partial functions and async calls.
// Based on this microsoft post: http://msdn.microsoft.com/en-us/scriptjunkie/gg575560
 
_.mixin({
    // Turn a normal function into an asynchronous version.
    // It will return a function that expect's the last argument
    // to be a callback expecting (err, result) as arguments.
    wrapAsync: function(fn) {
        return function() {
            var args = _(arguments).toArray();
            var next = args.pop();
 
            var result = fn.apply(null, args);
            next(null, result);
        }
    },
 
    // Generate a closure with parts of the arguments already filled out.
    // This does not bind 'this', so it is left up the caller to use the right
    // context.
    partial: function(fn){
        var aps = Array.prototype.slice;
 
        var argsOrig = aps.call(arguments, 1);
        return function(){
            var args = [],
                argsPartial = aps.call(arguments),
                i = 0;
 
                // Iterate over all the originally-specified arguments. If that
                // argument was the `_.__` placeholder, use the next just-
                // passed-in argument, otherwise use the originally-specified
                // argument.
                for ( ; i < argsOrig.length; i++ ) {
                    args[i] = argsOrig[i] === _.__
                    ? argsPartial.shift()
                    : argsOrig[i];
                }
 
                // If any just-passed-in arguments remain, add them to the end.
                return fn.apply( this, args.concat( argsPartial ) );
        };
 
    },
 
    // Wrap a non-async call with a partial.
    partialAsync: function() {
        var pArgs = _(arguments).toArray();
        var fn = pArgs.shift();
 
        pArgs.unshift(_.wrapAsync(callback));
 
        return _.partial.apply(null, pArgs);
    },
    __: {}, // Identity of placeholder fields
});