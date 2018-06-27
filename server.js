
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
			con.query('INSERT INTO users (email, full_name) VALUES (?, ?);', [user.email, user.displayName], function(err, rows) {
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

// middleware to restrict pages to authenticated users
function restrictAuth(req, res, next) {
	if (req.isAuthenticated()) return next();
	else res.redirect('/auth/google?returnTo=' + querystring.escape(req.url));
}

// middleware to restrict pages to admin users
function restrictAdmin(req, res, next) {
	if (req.isAuthenticated()) {
		if (req.user.local.is_admin) {
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

// middleware (POSTs) to check if requester is admin
function isAdmin(req, res, next) {
	if (req.isAuthenticated() && req.user.local.is_admin == 1) {
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
		username: req.user ? (req.user.local ? req.user.local.full_name : undefined) : undefined,
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
	// get all un-archived categories
	con.query('SELECT * FROM categories WHERE is_archived = 0;', function(err, rows) {
		if (!err && rows !== undefined && rows.length > 0) {
			res.render('ask.html', {
				loggedIn: true,		// page restricted to auth'd users
				categories: rows
			});
		} else {
			res.render('ask.html', { loggedIn: true });
		}
	});
});

// get user profile
app.get('/users/:id', function(req, res) {
	// get user corresponding to ID
	con.query('SELECT * FROM users WHERE uid = ?;', [req.params.id], function(err, rows) {
		if (!err && rows !== undefined && rows.length > 0) {
			var render = rows[0];

			// check if user is visiting their own user page
			render.ownProfile = req.isAuthenticated() && req.user.local.uid == req.params.id;

			// count questions and answers
			con.query('SELECT SUM(CASE WHEN type = 1 THEN 1 ELSE 0 END) questionCount, SUM(CASE WHEN type = 0 THEN 1 ELSE 0 END) answerCount FROM posts WHERE owner_uid = ?;', [req.params.id], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					render.questions_asked = rows[0].questionCount ? rows[0].questionCount : 0;
					render.answers_given = rows[0].answerCount ? rows[0].answerCount : 0;
				}

				con.query('SELECT IFNULL(p.parent_question_uid, p.uid) AS redirect_uid, IFNULL(q.title, p.title) AS title, p.type AS isQuestion, DATE_FORMAT(CASE WHEN p.type = 1 THEN p.creation_date ELSE q.creation_date END, "%M %D, %Y") date FROM posts p LEFT JOIN posts q ON p.parent_question_uid = q.uid WHERE p.owner_uid = ? ORDER BY p.uid DESC LIMIT 20;', [req.params.id], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0) {

						for (var i = 0; i < rows.length; i++) {
							rows[i].isQuestion = !!rows[i].isQuestion;
						}

						render.posts = rows;
					}

					res.render('user.html', render);
				});
			});
		} else {
			res.render('usernotfound.html');
		}
	});
});

// request UI for editing user profile
app.get('/users/edit/:id', restrictAuth, function(req, res) {
	// ensure editing OWN profile
	if (req.user.local.uid == req.params.id) {
		// pull user data
		con.query('SELECT * FROM users WHERE uid = ?;', [req.user.local.uid], function(err, rows) {
			if (!err && rows !== undefined && rows.length > 0) {
				res.render('editprofile.html', rows[0]);
			} else {
				res.render('error.html', { message: "There was a problem accessing user information." });
			}
		});
	} else {
		res.render('error.html', { message: "You do not have authorization to edit this profile." });
	}
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

				// get associated answers, highest upvotes first
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

// allow admin to make special changes
app.get('/adminPortal', restrictAdmin, function(req, res) {
	con.query('SELECT * FROM categories WHERE is_archived = 0;', function(err, rows) {
		if (!err && rows !== undefined && rows.length > 0) {
			res.render('adminportal.html', { categories: rows });
		} else {
			res.render('adminportal.html', { categoryFail: true });
		}
	});
});

/*
	THERE IS NO TAG PARSING GOING ON HERE ------------------------------------------------------------------->>
*/
// receive a new question or answer
app.post('/newPost', isAuthenticated, function(req, res) {

	// check for empty request
	if (req.body.body != '' && (req.body.title != '' || req.body.type == 0)) {
		// if question
		if (req.body.type == 1) {
			// check uncategorized (id == 0)
			if (!req.body.category_uid || req.body.category_uid == 0) {
				req.body.category_uid = null;
			} else {
				req.body.category_uid = parseInt(req.body.category_uid, 10);
				if (isNaN(req.body.category_uid)) req.body.category_uid = null;
			}

			// insert question into posts
			con.query('INSERT INTO posts (type, category_uid, owner_uid, owner_name, title, body) VALUES (1, ?, ?, ?, ?, ?);', 
				[req.body.category_uid, req.user.local.uid, req.user.local.full_name, req.body.title, req.body.body], function(err, rows) {

				if (!err) {
					// get uid of this new question
					con.query('SELECT LAST_INSERT_ID() AS uid;', function(err, rows) {
						if (!err && rows !== undefined && rows.length > 0) {
							// redirect to new question
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
				// insert answer into posts
				con.query('INSERT INTO posts (type, parent_question_uid, owner_uid, owner_name, body) VALUES (0, ?, ?, ?, ?);',
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

// receive a new comment
app.post('/newComment', isAuthenticated, function(req, res) {
	// check if request is legitimate
	if (req.body.body != '' && !isNaN(parseInt(req.body.parent_question, 10)) && !isNaN(parseInt(req.body.parent_uid, 10))) {
		// insert new comment
		con.query('INSERT INTO comments (parent_uid, parent_question_uid, body, owner_uid, owner_name) VALUES (?, ?, ?, ?, ?);',
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

// receive request to upvote a post, send back delta to change post's count by in UI
app.post('/upvote', isAuthenticated, function(req, res) {
	if (req.body.uid && !isNaN(parseInt(req.body.uid))) {
		// check for previous upvote to same post
		con.query('SELECT COUNT(*) AS count FROM upvotes WHERE user_uid = ? AND post_uid = ?;', [req.user.local.uid, req.body.uid], function(err, rows) {
			if (!err && rows !== undefined && rows.length > 0) {
				// if no upvote already made
				if (rows[0].count == 0) {
					// increment upvotes
					con.query('UPDATE posts SET upvotes = upvotes + 1 WHERE uid = ?;', [req.body.uid], function(err, rows) {
						if (!err) {
							// add record of upvote
							con.query('INSERT INTO upvotes (user_uid, post_uid) VALUES (?, ?);', [req.user.local.uid, req.body.uid], function(err, rows) {});
							res.send({ delta: 1 });
						} else {
							res.send({ delta: 0 });
						}
					});
				} else {
					res.send({ delta: 0 });
				}
			} else {
				res.send({ delta: 0 });
			}
		});
	} else {
		res.send({ delta: 0 });
	}
});

// apply updates to a user's profile
app.post('/users/update', isAuthenticated, function(req, res) {
	var uid = req.body.uid, name = req.body.full_name, bio = req.body.bio;

	if (!isNaN(parseInt(uid, 10))) {
		// if user is authorized to make edits
		if (uid == req.user.local.uid) {
			con.query('UPDATE users SET full_name = ?, bio = ? WHERE uid = ?;', [name, bio, req.user.local.uid], function(err, rows) {
				if (!err) {
					// update session info
					req.user.local.full_name = name;
					req.user.local.bio = bio;

					con.query('UPDATE posts, comments SET posts.owner_name = ?, comments.owner_name = ? WHERE posts.owner_uid = ? AND comments.owner_uid = ?;', [name, name, uid, uid], function(err, rows) {
						res.redirect('/users/' + req.user.local.uid);
					});
				} else {
					res.render('error.html');
				}
			});
		} else {
			res.redirect('/users/' + uid);
		}
	} else {
		res.redirect('/');
	}
});

// admin: add account to system manually
app.post('/addAccount', isAdmin, function(req, res) {
	con.query('SELECT COUNT(*) AS count FROM users WHERE email = ?;', [req.body.email], function(err, rows) {
		if (!err && rows !== undefined && rows.length > 0) {
			if (rows[0].count == 0) {
				// insert new user into table
				con.query('INSERT INTO users (email, full_name) VALUES (?, ?);', [req.body.email, req.body.name], function(err, rows) {
					if (!err) {
						res.send('Success');
					} else {
						res.render('error.html', { message: "There was a problem adding the new user." });
					}
				});
			} else {
				res.render('error.html', { message: "Conflict with existing email." });
			}
		} else {
			res.render('error.html');
		}
	});
});

// admin: make user admin by posting email
app.post('/makeAdmin', isAdmin, function(req, res) {
	con.query('UPDATE users SET is_admin = 1 WHERE email = ?;', [req.body.email], function(err, rows) {
		if (!err) {
			res.send('Success');
		} else {
			res.render('error.html', { message: "Failed to make '" + req.body.email + "' an admin." });
		}
	});
});

// admin: remove user's admin privileges
app.post('/removeAdmin', isAdmin, function(req, res) {
	// safety: prevent admin from removing themself
	if (req.body.email != req.user.local.email) {
		con.query('UPDATE users SET is_admin = 0 WHERE email = ?;', [req.body.email], function(err, rows) {
			if (!err) {
				res.send('Success');
			} else {
				res.render('error.html', { message: "Failed to remove admin privileges from '" + req.body.email + "'" });
			}
		});
	} else {
		res.render('error.html', { message: "You are unable to deauthorize yourself." });
	}
});

// admin: create a new category
app.post('/newCategory', isAdmin, function(req, res) {
	con.query('INSERT INTO categories (name) VALUES (?);', [req.body.category], function(err, rows) {
		if (!err) {
			res.send('Success');
		} else {
			res.render('error.html', { message: "Failed to add category." });
		}
	});
});

// admin: remove an existing category by uid
app.post('/removeCategory', isAdmin, function(req, res) {
	if (req.body.uid) {
		// check if category used
		con.query('SELECT COUNT(*) AS count FROM posts WHERE category_uid = ?;', [req.body.uid], function(err, rows) {
			if (!err && rows !== undefined && rows.length > 0) {
				if (rows[0].count > 0) {
					// archive category
					con.query('UPDATE categories SET is_archived = 1 WHERE uid = ?;', [req.body.uid], function(err, rows) {
						if (!err) {
							res.send('Success');
						} else {
							res.render('error.html', { message: "Failed to remove category." });
						}
					});
				} else {
					// full delete category if never used
					con.query('DELETE FROM categories WHERE uid = ?;', [req.body.uid], function(err, rows) {
						if (!err) {
							res.send('Success');
						} else {
							res.render('error.html', { message: "Unable to remove category" });
						}
					});
				}
			} else {
				res.render('error.html', { message: "There was an error attempting to remove category" });
			}
		});
	} else {
		res.redirect('/');
	}
});

// admin: remove a post
app.post('/deletePost', isAdmin, function(req, res) {
	con.query('DELETE FROM posts WHERE uid = ?;', [req.body.uid], function(err, rows) {
		if (!err) {
			res.send('Success');
		} else {
			res.render('error.html', { message: "Failed to remove post." });
		}
	});
});

// admin: remove a comment
app.post('/deleteComment', isAdmin, function(req, res) {
	con.query('DELETE FROM comments WHERE uid = ?;', [req.body.uid], function(err, rows) {
		if (!err) {
			res.send('Success');
		} else {
			res.render('error.html', { message: "Failed to delete comment." });
		}
	});
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