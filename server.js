
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
		if (req.user.isAdmin) {
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
		username: "",
		user_uid: undefined
	};
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

// get individual question page
app.get('/questions/:id', function(req, res) {
	var render = {}, ansIDtoIndex = {}, question_uid = req.params.id;

	// check if post exists & get its data
	con.query('SELECT posts.*, categories.name AS category FROM posts LEFT OUTER JOIN categories ON posts.category_uid = categories.uid WHERE posts.uid = ? AND type = 1 LIMIT 1;', [question_uid], function(err, rows) {
		if (!err && rows !== undefined && rows.length > 0) {
			render = Object.assign({
				loggedIn: req.isAuthenticated(),
				question_uid: question_uid
			}, rows[0]);

			if (render.category_uid == null) render.noCategory = true;

			// get associated tags
			con.query('SELECT tag FROM tags WHERE post_uid = ?;', [question_uid], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					render.tags = rows;
				}

				// get associated answers
				con.query('SELECT * FROM posts WHERE parent_question_uid = ? ORDER BY upvotes DESC;', [question_uid], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0) {
						render.answers = rows;

						for (var i = 0; i < render.answers.length; i++) {
							ansIDtoIndex[render.answers[i].uid] = i;
							render.answers[i].answer_uid = render.answers[i].uid;
						}
					}
					// get associated comments
					con.query('SELECT * FROM comments WHERE parent_question_uid = ?;', [question_uid], function(err, rows) {
						if (!err && rows !== undefined && rows.length > 0) {
							render.comments = [];
							var ans;

							// assign comments to their parent posts
							for (var i = 0; i < rows.length; i++) {
								if (rows[i].parent_uid == question_uid) {
									render.comments.push(rows[i]);
								} else {
									ans = render.answers[ansIDtoIndex[rows[i].parent_uid]];
									if (!ans.answer_comments) ans.answer_comments = [];
									ans.answer_comments.push(rows[i]);
								}
							}
						}

						res.render('question.html', render);
					});

				});
			});
		} else {
			// question not found, send not found page
			res.render('qnotfound.html');
		}
	});
});













































// ---------------------------------- TESTING -------------------------------------------------------------

// // -----
// // this is a temp hack -- johnny you need to enable the Google+ API apparently
// GoogleStrategy.prototype.userProfile = function(token, done) {
//   done(null, {})
// }
// // -----

// debug oauth
app.get('/testauth', function(req, res) {
	res.send(JSON.stringify(req.user) || "");
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

app.post('/newComment', restrictAuth, function(req, res) {
	res.send(req.body);
});