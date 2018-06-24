
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
var pagedown			= require('pagedown');
var con					= require('./database.js').connection;
var creds				= require('./credentials.js');
var mdConverter			= new pagedown.getSanitizingConverter();

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

// middleware (mainly for POST reqs) to check if auth'd
function isAuthenticated(req, res, next) {
	if (req.isAuthenticated()) {
		return next();
	} else {
		res.redirect('/');
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
	con.query('SELECT posts.*, categories.name AS category FROM posts LEFT OUTER JOIN categories ON posts.category_uid = categories.uid WHERE posts.type = 1 ORDER BY uid DESC LIMIT 30;', function(err, rows) {
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
			res.render('ask.html', {
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
					render.questions_asked = rows[0].questionCount ? rows[0].questionCount : 0;
					render.answers_given = rows[0].answerCount ? rows[0].answerCount : 0;
				}

				// check if user is visiting their own user page
				render.ownProfile = req.isAuthenticated() && req.user.local.uid == req.params.id;

				res.render('user.html', render);
			});
		} else {
			res.render('usernotfound.html');
		}
	});
});

// get individual question page
app.get('/questions/:id', function(req, res) {
	var render = {}, ansIDtoIndex = {}, ans, question_uid = req.params.id;

	// check if post exists & get its data
	con.query('SELECT posts.*, categories.name AS category FROM posts LEFT OUTER JOIN categories ON posts.category_uid = categories.uid WHERE posts.uid = ? AND type = 1 LIMIT 1;', [question_uid], function(err, rows) {
		if (!err && rows !== undefined && rows.length > 0) {
			render = Object.assign({
				loggedIn: req.isAuthenticated(),
				question_uid: question_uid
			}, rows[0]);

			// convert MD to HTML
			render.body = mdConverter.makeHtml(render.body);

			// compensate for lack of category
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
							ans = render.answers[i];

							ans.body = mdConverter.makeHtml(ans.body);	// convert answers to HTML
							ansIDtoIndex[ans.uid] = i;	// record answer ID to index
							ans.answer_uid = ans.uid;	// put uid under name 'answer_uid'
						}
					}
					// get associated comments
					con.query('SELECT * FROM comments WHERE parent_question_uid = ?;', [question_uid], function(err, rows) {
						if (!err && rows !== undefined && rows.length > 0) {
							render.comments = [];

							// assign comments to their parent posts
							for (var i = 0; i < rows.length; i++) {
								rows[i].body = mdConverter.makeHtml(rows[i].body);	// convert comments to HTML

								// attach comment to either question or parent answer
								if (rows[i].parent_uid == question_uid) {
									render.comments.push(rows[i]);
								} else {
									ans = render.answers[ansIDtoIndex[rows[i].parent_uid]];
									if (!ans.answer_comments) ans.answer_comments = [];
									ans.answer_comments.push(rows[i]);
								}
							}
						}

						// render full question page
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

// receive a new question or answer
app.post('/newPost', isAuthenticated, function(req, res) {

	// check for empty request
	if (req.body.body != '' && (req.body.title != '' || req.body.type == 0)) {
		// if question
		if (req.body.type == 1) {
			// check uncategorized
			if (!req.body.category_uid || req.body.category_uid == 0) {
				req.body.category_uid = null;
			} else {
				req.body.category_uid = parseInt(req.body.category_uid, 10);
				if (isNaN(req.body.category_uid)) req.body.category_uid = null;
			}

			// insert post into table
			con.query('INSERT INTO posts (type, category_uid, owner_uid, owner_name, creation_date, answer_count, upvotes, title, body) VALUES (1, ?, ?, ?, NOW(), 0, 0, ?, ?);', 
				[req.body.category_uid, req.user.local.uid, req.user.local.full_name, req.body.title, req.body.body], function(err, rows) {

				if (!err) {
					con.query('SELECT LAST_INSERT_ID() as uid;', function(err, rows) {
						if (!err && rows !== undefined && rows.length > 0) {
							res.redirect('/questions/' + rows[0].uid);
						} else {
							res.redirect('/');
						}
					});
				} else {
					res.redirect('/');
				}
			});

		// if answer
		} else if (req.body.type == 0) {
			// if legitimate parent question id
			if (req.body.parent_question != undefined && !isNaN(parseInt(req.body.parent_question, 10))) {
				
				con.query('INSERT INTO posts (type, parent_question_uid, owner_uid, owner_name, creation_date, upvotes, body) VALUES (0, ?, ?, ?, NOW(), 0, ?);',
					[req.body.parent_question, req.user.local.uid, req.user.local.full_name, req.body.body], function(err, rows) {
					if (!err) {
						// increment answer count on corresponding question
						con.query('UPDATE posts SET answer_count = answer_count + 1 WHERE uid = ?;', [req.body.parent_question], function(err, rows) {
							res.redirect('/questions/' + req.body.parent_question);
						});
					} else {
						res.redirect('/');
					}
				});
			} else {
				res.redirect('/');
			}
		}
	} else {
		res.redirect('/');
	}
});

app.post('/newComment', isAuthenticated, function(req, res) {
	// check if request is legitimate
	if (req.body.body != '' && !isNaN(parseInt(req.body.parent_question, 10)) && !isNaN(parseInt(req.body.parent_uid, 10))) {
		// insert new comment
		con.query('INSERT INTO comments (parent_uid, parent_question_uid, body, owner_uid, owner_name, creation_date) VALUES (?, ?, ?, ?, ?, NOW());',
			[req.body.parent_uid, req.body.parent_question, req.body.body, req.user.local.uid, req.user.local.full_name], function(err, rows) {

			// direct to relevant question page
			if (!err) {
				res.redirect('/questions/' + req.body.parent_question);
			} else {
				res.redirect('/');
			}
		});
	} else {
		res.redirect('/');
	}
});








































// ---------------------------------- TESTING -------------------------------------------------------------

// debug oauth
app.get('/testauth', function(req, res) {
	res.send(req.user || "You are not authenticated.");
});

// templates testing: ---------------------------------------------------------

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

app.get('/editProfile/:id', function(req, res) {
	// ensure editing OWN profile
	if (req.isAuthenticated() && req.user.local.uid == req.params.id) {
		res.send("You can edit your profile");
	} else {
		res.redirect('/');
	}
});