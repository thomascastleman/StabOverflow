
var express 			= require('express');
var app 				= express();
var mustacheExpress 	= require('mustache-express');
var bodyParser 			= require('body-parser');
var cookieParser 		= require('cookie-parser');
var session 			= require('cookie-session');
var passport 			= require('passport');
var pagedown			= require('pagedown');
var creds				= require('./credentials.js');
var mdConverter			= new pagedown.getSanitizingConverter();

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.engine('html', mustacheExpress());
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + '/views'));

// configure session
app.use(session({ 
	secret: creds.SESSION_SECRET,
	name: 'session',
	resave: true,
	saveUninitialized: true
}));

// import local modules for routes / all other functionality
var auth = require('./auth.js').init(app, passport);
var visitors = require('./visitor.js').init(app, mdConverter);
var user = require('./user.js').init(app, mdConverter);
var search = require('./search.js').init(app);
var userSearch = require('./usersearch.js').init(app);
var admin = require('./admin.js').init(app);
var mailer = require('./mailing.js');

// start server
var server = app.listen(8080, function() {
	console.log('StabOverflow server listening on port %d', server.address().port);
});

// fallback redirection to landing page
app.get('*', function(req, res) {
	res.redirect('/');
});