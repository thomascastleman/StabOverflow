var creds = require('./credentials.js');
var mysql = require('mysql');

module.exports = {
	connection: mysql.createConnection({
	    host: 'localhost',
	    user: creds.MySQL_username,
	    password: creds.MySQL_password,
	    database: 'staboverflow'
	})
}