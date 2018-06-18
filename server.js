
var express 			= require('express');
var app 				= express();
var mustacheExpress 	= require('mustache-express');
var bodyParser 			= require('body-parser');
var cookieParser 		= require('cookie-parser');
var moment 				= require('moment');
var session 			= require('cookie-session');
var GoogleStrategy 		= require('passport-google-oauth2').Strategy;
var passport 			= require('passport');

var server = app.listen(8080, function() {
	console.log("StabOverflow server listening on port %d", server.address().port);
});