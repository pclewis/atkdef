define(function(require) {
	var Class = require('atk/class');

	return new (new Class("fileType",
		{	PLAINTEXT: 'PlainText'
		,	CIPHERTEXT: 'CipherText'
		,	UNKNOWN: 'Unknown'
		,	invert: function(self, t) {
				switch(t) {
					case self.PLAINTEXT:  return self.CIPHERTEXT;
					case self.CIPHERTEXT: return self.PLAINTEXT;
					default: return t;
				}
			}
		}
	))();
});