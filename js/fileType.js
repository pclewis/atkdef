define(['atk/Class'], function(Class) {
	return new (new Class(
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