const bcrypt = require('bcryptjs');

// 1. Put your new password here
const newPassword = 'admin123'; 

const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(newPassword, salt);

console.log('Your new hash is:');
console.log(hash);