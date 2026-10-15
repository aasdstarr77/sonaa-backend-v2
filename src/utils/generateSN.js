const { customAlphabet } = require('nanoid');
const alphabet = '0123456789';
const nanoid = customAlphabet(alphabet, 6);
function generateSN() { return 'SN' + nanoid(); }
module.exports = { generateSN };
