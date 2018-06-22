
var express 			= require('express');
var app 				= express();
var mustacheExpress 	= require('mustache-express');
var bodyParser 			= require('body-parser');
var cookieParser 		= require('cookie-parser');
var moment 				= require('moment');
var session 			= require('cookie-session');
var GoogleStrategy 		= require('passport-google-oauth2').Strategy;
var passport 			= require('passport');
var querystring			= require('querystring');
var con					= require('./database.js').connection;
var creds				= require('./credentials.js');

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.engine('html', mustacheExpress());
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + '/views'));

passport.serializeUser(function(user, done) {
	console.log("serialize");
	done(null, user);
});

passport.deserializeUser(function(user, done) {
	user.variable = "this is a test";
	console.log("deserialize");
	done(null, user);
});

passport.use(new GoogleStrategy({
		clientID:		creds.GOOGLE_CLIENT_ID,
		clientSecret:	creds.GOOGLE_CLIENT_SECRET,
		callbackURL:	creds.domain + "/auth/google/callback",
		passReqToCallback: true
	},
	function(request, accessToken, refreshToken, profile, done) {
		process.nextTick(function () {
			return done(null, profile);
		});
	}
));

app.use(session({ 
	secret: creds.SESSION_SECRET,
	name: 'session',
	resave: true,
	saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

app.get('/auth/google', checkReturnTo, passport.authenticate('google', { scope: [
		'https://www.googleapis.com/auth/userinfo.profile',
		'https://www.googleapis.com/auth/userinfo.email'
	]
}));

app.get('/auth/google/callback',
	passport.authenticate('google', {
		successReturnToOrRedirect: '/',
		failureRedirect: '/failure'
}));

app.get('/failure', function(req, res) {
	res.send("Failure :(");
});

app.get('/logout', function(req, res){
	req.logout();
	res.redirect('/');
});

var server = app.listen(8080, function() {
	console.log("StabOverflow server listening on port %d", server.address().port);
});

function checkReturnTo(req, res, next) {
	var returnTo = req.query['returnTo'];
	if (returnTo) {
		req.session = req.session || {};
		req.session.returnTo = querystring.unescape(returnTo);
	}
	next();
}

// middleware to restrict page to authenticated users
function restrictTo(roles) {
	if (roles === 'authenticated') return function (req, res, next) {
		if (req.isAuthenticated()) return next();
		else res.redirect('/auth/google?returnTo=' + querystring.escape(req.url));
	};
	else return function(req, res, next) {
		next();
	};
}

// ask a question page, restricted
app.get('/ask', restrictTo('authenticated'), function(req, res) {
	con.query('SELECT * FROM categories;', function(err, rows) {
		if (!err && rows !== undefined && rows.length > 0) {
			res.render('ask.html', {
				loggedIn: true,		// page restricted to auth'd users
				categories: rows
			});
		} else {
			res.send("Page could not be reached.");
		}
	});
});

// get user profile
app.get('/users/:id', function(req, res) {
	// get user corresponding to ID
	con.query('SELECT * FROM users WHERE uid = ?;', [req.params.id], function(err, rows) {
		if (!err && rows !== undefined && rows.length > 0) {
			var render = rows[0];

			// count questions and answers
			con.query('SELECT SUM(CASE WHEN type = 1 THEN 1 ELSE 0 END) questionCount, SUM(CASE WHEN type = 0 THEN 1 ELSE 0 END) answerCount FROM posts WHERE owner_uid = ?;', [req.params.id], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					render.questions_asked = rows[0].questionCount;
					render.answers_given = rows[0].answerCount;
				} else {
					render.questions_asked = "N/A";
					render.answers_given = "N/A";
				}
				res.render('user.html', render);
			});
		} else {
			res.send("Could not find user.");
		}
	});
});





















// ---------------------------------- TESTING -------------------------------------------------------------

// -----
// this is a temp hack -- johnny you need to enable the Google+ API apparently
GoogleStrategy.prototype.userProfile = function(token, done) {
  done(null, {})
}
// -----

// debug oauth
app.get('/testauth', function(req, res) {
	res.send(JSON.stringify(req.user) || "");
});

// templates testing: ---------------------------------------------------------

app.get('/', function(req, res) {
	res.render('landingpage.html', {
		loggedIn: req.isAuthenticated(),
		username: "Bobby Joe",
		user_uid: 31,
		questions: [
			{
				uid: 1,
				title: "Test question no. 1?",
				upvotes: 24,
				answer_count: 1,
				owner_name: "Test Name",
				owner_uid: 314,
				category: "CSP",
				when_asked: "20 min ago",
			},
			{
				uid: 2,
				title: "Another test question?",
				upvotes: 16,
				answer_count: 0,
				owner_name: "User Number 2",
				owner_uid: 287,
				category: "HSE",
				when_asked: "46 min ago",
			}
		]
	});
});

app.post('/newPost', function(req, res) {
	res.send(req.body);
});

app.get('/questions/:id', function(req, res) {
	res.end(req.params.id);
});

app.get('/search', function(req, res) {
	res.render('search.html', {
		loggedIn: true,
		categories: [
			{ name: "CSP", uid: 1 },
			{ name: "HDS", uid: 2 },
			{ name: "HSE", uid: 3 }
		],
		results: [
			{
				uid: 1,
				title: "How do I do this?",
				upvotes: 24,
				answer_count: 1,
				owner_name: "Test Name",
				owner_uid: 314,
				category: "CSP",
				when_asked: "20 min ago",
			},
			{
				uid: 2,
				title: "What is the best way to ask a question?",
				upvotes: 16,
				answer_count: 0,
				owner_name: "User Number 2",
				owner_uid: 287,
				category: "HSE",
				when_asked: "46 min ago",
			}
		]
	});
});

app.post('/search', function(req, res) {
	res.send(req.body);
})