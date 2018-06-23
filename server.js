
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
	// lookup user in system
	con.query('SELECT * FROM users WHERE email = ?;', [user.email], function(err, rows) {
		if (!err && rows !== undefined && rows.length > 0) {
			user.local = rows[0];
			done(null, user);

		// if email domain legitimate
		} else if (/.+?@(students\.)?stab\.org/.test(user.email)) {
			// create new user
			con.query('INSERT INTO users (email, full_name, is_admin) VALUES (?, ?, 0);', [user.email, user.displayName], function(err, rows) {
				con.query('SELECT * FROM users WHERE email = ?;', [user.email], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0) {
						user.local = rows[0];
					}
					done(null, user);
				});
			});
		} else {
			done("Your email cannot be used with this service. Please use a 'students.stab.org' or 'stab.org' email.", null);
		}
	});
});

passport.deserializeUser(function(user, done) {
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
	res.send("Authentication Failure :(");
});

app.get('/logout', function(req, res){
	req.logout();
	res.redirect('/');
});

function checkReturnTo(req, res, next) {
	var returnTo = req.query['returnTo'];
	if (returnTo) {
		req.session = req.session || {};
		req.session.returnTo = querystring.unescape(returnTo);
	}
	next();
}

// middleware to restrict to authenticated users
function restrictAuth(req, res, next) {
	if (req.isAuthenticated()) return next();
	else res.redirect('/auth/google?returnTo=' + querystring.escape(req.url));
}

// middleware to restrict to admin users
function restrictAdmin(req, res, next) {
	if (req.isAuthenticated()) {
		if (req.user.local-is_admin) {
			return next();
		} else {
			res.redirect('/');
		}
	} else {
		res.redirect('/auth/google?returnTo=' + querystring.escape(req.url));
	}
}

var server = app.listen(8080, function() {
	console.log("StabOverflow server listening on port %d", server.address().port);
});

// get landing page
app.get('/', function(req, res) {
	var render = {
		loggedIn: req.isAuthenticated(),

		// get these from session
		username: req.user ? req.user.displayName : undefined,
		user_uid: req.user ? (req.user.local ? req.user.local.uid : undefined) : undefined
	};

	// this pulls the 30 most recent questions
	con.query('SELECT posts.*, categories.name AS category FROM posts LEFT OUTER JOIN categories ON posts.category_uid = categories.uid WHERE posts.type = 1 LIMIT 30;', function(err, rows) {
		if (!err && rows !== undefined && rows.length > 0) {
			// format time posted
			for (var i = 0; i < rows.length; i++) {
				rows[i].when_asked = moment(rows[i].creation_date).fromNow();
				delete rows[i].creation_date;
				if (rows[i].category_uid == null) rows[i].noCategory = true;
			}
			render.questions = rows;
		}

		res.render('landingpage.html', render);
	});
});

// ask a question page, restricted
app.get('/ask', restrictAuth, function(req, res) {
	con.query('SELECT * FROM categories;', function(err, rows) {
		if (!err && rows !== undefined && rows.length > 0) {
			res.render('ask.html', {
				loggedIn: true,		// page restricted to auth'd users
				categories: rows
			});
		} else {
			res.render('ask.html' {
				loggedIn: true
			});
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

// debug oauth
app.get('/testauth', function(req, res) {
	res.send(req.user || "");
});

// templates testing: ---------------------------------------------------------

app.post('/newPost', restrictAuth, function(req, res) {
	res.send(req.body);
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
});

app.get('/questions/:id', function(req, res) {
	res.render('question.html', {
		loggedIn: req.isAuthenticated(),

		question_uid: 3,
		title: "How do I ask a question?",
		body: "<p>This is my <em>question.</em></p>",
		category: "HDS",
		category_uid: 2,
		has_category: true,
		owner_uid: 1,
		owner_name: "User One",
		creation_date: "6-22-18 10:43",
		answer_count: 2,
		upvotes: 14,
		tags: [
			{ tag: "test"},
			{ tag: "question"}
		],

		comments: [
			{
				body: "<p>This is a comment on the question.</p>",
				owner_uid: 4,
				owner_name: "User Four",
				creation_date: "6-22-18 12:01"
			},
			{
				body: "<p>Here is a second comment on the original question</p>",
				owner_uid: 3,
				owner_name: "User Three",
				creation_date: "6-22-18 14:53"
			}
		],

		answers: [
			{
				body: "<h2>Your question has an answer.</h2><p>Here is my answer to your question</p>",
				owner_uid: 5,
				owner_name: "User 5",
				creation_date: "6-24-18 09:13",
				upvotes: 12,
				answer_uid: 8,

				comments: [
					{
						body: "<p>Here is a new comment on an answer</p>",
						owner_uid: 3,
						owner_name: "User Three",
						creation_date: "6-22-18 14:53"
					},
					{
						body: "<p>Here is a second comment on the answer</p>",
						owner_uid: 3,
						owner_name: "User Three",
						creation_date: "6-22-18 14:53"
					}
				]
			},
			{
				body: "<h2>Your question has ANOTHER answer.</h2><p>Here is my other answer to your question</p>",
				owner_uid: 2,
				owner_name: "User 2",
				creation_date: "6-24-18 09:13",
				upvotes: 18,

				comments: [
					{
						body: "<p>what a great answer</p>",
						owner_uid: 1,
						owner_name: "User One",
						creation_date: "6-22-18 14:53"
					}
				]
			}
		]
	});
});

app.post('/newComment', restrictAuth, function(req, res) {
	res.send(req.body);
});