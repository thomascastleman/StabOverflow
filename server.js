
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
var chunk				= require('lodash.chunk');
var con					= require('./database.js').connection;
var creds				= require('./credentials.js');
var porterStemmer		= require('./porterstemmer.js');
var mdConverter			= new pagedown.getSanitizingConverter();

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.engine('html', mustacheExpress());
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + '/views'));

var settings = {
	numQuestionsOnLanding: 30,		// number of recent questions shown on the landing page
	numPostsOnUserPage: 20			// number of posts shown on user page
}

passport.serializeUser(function(user, done) {
	// lookup user in system
	con.query('SELECT * FROM users WHERE email = ?;', [user.email], function(err, rows) {
		if (!err && rows !== undefined && rows.length > 0) {
			user.local = rows[0];
			done(null, user);

		// if email domain legitimate
		} else if (/.+?@(students\.)?stab\.org/.test(user.email)) {
			// create new user
			con.query('CALL create_user(?, ?);', [user.email, user.displayName], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0 && rows[0].length > 0) {
					user.local = rows[0][0];
					done(null, user);
				} else {
					done("There was an error creating your profile.", null);
				}
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
	res.render('error.html', { message: "Unable to authenticate." });
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

	// this pulls most recent questions
	con.query('SELECT posts.*, categories.name AS category FROM posts LEFT OUTER JOIN categories ON posts.category_uid = categories.uid WHERE posts.type = 1 ORDER BY posts.uid DESC LIMIT ?;', [settings.numQuestionsOnLanding], function(err, rows) {
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

				// get recent questions and answers by this user
				con.query('SELECT IFNULL(p.parent_question_uid, p.uid) AS redirect_uid, IFNULL(q.title, p.title) AS title, p.type AS isQuestion, DATE_FORMAT(CASE WHEN p.type = 1 THEN p.creation_date ELSE q.creation_date END, "%M %D, %Y") date FROM posts p LEFT JOIN posts q ON p.parent_question_uid = q.uid WHERE p.owner_uid = ? ORDER BY p.uid DESC LIMIT ?;', [req.params.id, settings.numPostsOnUserPage], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0) {
						// convert to boolean
						for (var i = 0; i < rows.length; i++) {
							rows[i].isQuestion = !!rows[i].isQuestion;
						}

						render.posts = rows;
					}

					res.render('user.html', render);
				});
			});
		} else {
			res.render('error.html', { message: "User not found." });
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

			// check if admin, if owns question
			render.isAdmin = render.loggedIn ? req.user.local.is_admin : false;
			if (render.loggedIn) render.isQuestionOwner = render.owner_uid == req.user.local.uid;

			// convert MD to HTML
			render.body = mdConverter.makeHtml(render.body);

			// compensate for lack of category
			if (render.category_uid == null) render.noCategory = true;

			// get associated answers, highest upvotes first
			con.query('SELECT * FROM posts WHERE parent_question_uid = ? ORDER BY upvotes DESC;', [question_uid], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					render.answers = rows;

					for (var i = 0; i < render.answers.length; i++) {
						ans = render.answers[i];

						ans.body = mdConverter.makeHtml(ans.body);	// convert answers to HTML
						ansIDtoIndex[ans.uid] = i;	// record answer ID to index
						ans.answer_uid = ans.uid;	// put uid under name 'answer_uid'

						if (render.loggedIn) ans.isOwner = ans.owner_uid == req.user.local.uid;
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
		} else {
			// question not found, send not found page
			res.render('error.html', { message: "Question not found." });
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

// request UI for editing existing post
app.get('/editPost/:id', restrictAuth, function(req, res) {
	// ensure editing own post
	con.query('SELECT title, body FROM posts WHERE uid = ? AND owner_uid = ?;', [req.params.id, req.user.local.uid], function(err, rows) {
		if (!err && rows !== undefined && rows.length > 0) {
			res.render('editpost.html', {
				uid: req.params.id,
				title: rows[0].title,
				body: mdConverter.makeHtml(rows[0].body)
			});
		} else {
			res.render('error.html', { message: "Unable to edit post" });
		}
	});
});

// receive a new question or answer
app.post('/newPost', isAuthenticated, function(req, res) {
	// check for empty request
	if (req.body.body != '' && (req.body.title != '' || req.body.type == 0)) {
		// if question
		if (req.body.type == 1) {
			// check uncategorized (id == 0)
			req.body.category_uid = parseInt(req.body.category_uid, 10);
			if (isNaN(req.body.category_uid)) req.body.category_uid = null;

			// insert question into posts
			con.query('CALL create_question(?, ?, ?, ?, ?);', [req.body.category_uid, req.user.local.uid, req.user.local.full_name, req.body.title, req.body.body], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0 && rows[0].length > 0) {
					indexPost(rows[0][0].redirect_uid, req.body.title, req.body.body);	// index the new question
					res.redirect('/questions/' + rows[0][0].redirect_uid);	// redirect to this question's page
				} else {
					res.render('error.html', { message: "Failed to post question." });
				}
			});

		// if answer
		} else if (req.body.type == 0) {
			// if legitimate parent question id
			if (req.body.parent_question != undefined && !isNaN(parseInt(req.body.parent_question, 10))) {
				// insert answer into posts
				con.query('CALL create_answer(?, ?, ?, ?);', [req.body.parent_question, req.user.local.uid, req.user.local.full_name, req.body.body], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0 && rows[0].length > 0) {
						indexPost(rows[0][0].answer_uid, req.body.title, req.body.body);	// index the new answer
						res.redirect('/questions/' + req.body.parent_question);	// redirect to parent question's page
					} else {
						res.render('error.html', { message: "Failed to post answer." });
					}
				});
			} else {
				res.redirect('/');
			}
		} else {
			res.redirect('/');
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
				res.render('error.html', { message: "Failed to post comment." });
			}
		});
	} else {
		res.redirect('/');
	}
});

// append to an existing post
app.post('/updatePost', isAuthenticated, function(req, res) {
	// avoid empty appendage
	if (req.body.appendage != '') {
		// ensure editing own post
		con.query('SELECT type, parent_question_uid FROM posts WHERE uid = ? AND owner_uid = ?;', [req.body.uid, req.user.local.uid], function(err, rows) {
			if (!err && rows !== undefined && rows.length > 0) {

				var editMessage = '\n\n*Edited ' + moment().format('h:mm A M/D/YYYY') + ':*\n\n';

				// apply edits
				con.query('UPDATE posts SET body = concat(body, ?) WHERE uid = ?;', [editMessage + req.body.appendage, req.body.uid], function(err, rows2) {
					if (!err) {
						// redirect to edited post
						var redirect_uid = rows[0].type == 1 ? req.body.uid : rows[0].parent_question_uid
						res.redirect(redirect_uid ? '/questions/' + redirect_uid : '/');
					} else {
						res.render('error.html', { message: "Failed to apply edits to post" });
					}
				});
			} else {
				res.render('error.html', { message: "You are unable to edit this post." });
			}
		});
	} else {
		res.render('error.html', { message: "Failed to make edits (empty appendage)" });
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

					// update posts that stored this info
					con.query('UPDATE posts, comments SET posts.owner_name = ?, comments.owner_name = ? WHERE posts.owner_uid = ? AND comments.owner_uid = ?;', [name, name, uid, uid], function(err, rows) {});
					
					// send back to updated user page
					res.redirect('/users/' + req.user.local.uid);
				} else {
					res.render('error.html', { message: "Failed to change user information." });
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

			if (req.body.parent_question_uid) {
				// update answer count if answer
				con.query('UPDATE posts SET answer_count = CASE WHEN answer_count > 0 THEN answer_count - 1 ELSE 0 END WHERE uid = ?;', [req.body.parent_question_uid], function(err, rows) {});
			} else {
				// delete child answer posts
				con.query('DELETE FROM posts WHERE parent_question_uid = ?;', [req.body.uid], function(err, rows) {});
			}
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

// post search query, render results
app.post('/search', function(req, res) {
	var catFilter = categoryFilter(req.body.category);
	var ansFilter = answerFilter(req.body.answeredStatus);
	var render = { query: req.body.query };

	// pull question categories
	con.query('SELECT * FROM categories WHERE is_archived = 0;', function(err, categories) {
		if (!err && categories !== undefined && categories.length > 0) {
			render.categories = categories;

			// register which category was filtered
			for (var i = 0; i < categories.length; i++) {
				if (categories[i].uid == req.body.category) {
					categories[i].isSelected = true;
					break;
				}
			}
		}

		render[req.body.answeredStatus] = true;	// register which answer filter used

		// search by query if possible
		if (req.body.query) {
			var query = parseQuery(req.body.query);

			// get relevant posts
			con.query('CALL query(?, ?, ?);', [query, catFilter, ansFilter], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0 && rows[0].length > 0) {
					render.results = rows[0];
				}

				res.render('search.html', render);
			});

		// search only by constraints if they exist
		} else if (req.body.category && req.body.answeredStatus) {
			
			// get posts meeting constraints
			con.query('CALL noquery(?, ?);', [catFilter, ansFilter], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0 && rows[0].length > 0) {
					render.results = rows[0];
				}

				res.render('search.html', render);	
			});
		// fallback
		} else {
			res.redirect('/search');
		}
	});
});

// given free text query, strip of stop words, etc, and format for SQL query
function parseQuery(q) {
	// query preprocessing
	var re = new RegExp(/[^a-zA-Z ]/, 'g'), query = [];
	var words = q.replace(re, '');
	words = words.toLowerCase().split(" ");

	// filter out stop words, stem query terms
	for (var i = 0; i < words.length; i++) {
		if (!isStopWord(words[i])) {
			query.push('"' + porterStemmer.stem(words[i]) + '"');
		}
	}

	return query.join(',');
}

// generate SQL to apply answer status constraint
function answerFilter(status) {
	if (status == "Unanswered") {
		return " AND q.answer_count = 0";
	} else if (status == "Answered") {
		return " AND q.answer_count > 0";
	} else {
		return "";
	}
}

// generate SQL to apply category constraint
function categoryFilter(uid) {
	uid = parseInt(uid, 10);

	if (!uid || uid == 0) {
		return "";
	} else {
		return " AND q.category_uid = " + uid;
	}
}

// determine if word is irrelevant
// (from https://gist.github.com/sebleier/554280)
function isStopWord(w) {
	return ["", "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now"].indexOf(w) != -1;
}

// render search page with recent questions
app.get('/search', function(req, res) {
	var render = {};

	// get categories for filters
	con.query('SELECT * FROM categories WHERE is_archived = 0;', function(err, categories) {
		if (!err && categories !== undefined && categories.length > 0) {
			render.categories = categories;
		}

		// get recent posts
		con.query('CALL noquery("", "");', function(err, rows) {
			if (!err && rows !== undefined && rows.length > 0 && rows[0].length > 0) {
				render.results = rows[0];
			}

			res.render('search.html', render);
		});
	});
});

// make post accessible to search engine
function indexPost(uid, title, body) {

	var re = new RegExp(/[^a-zA-Z ]/, 'g');
	var words = (title + '\n' + body).toLowerCase().split(/\s/);
	var stems = [], scores = {}, max;

	// for each term in post
	for (var i = 0; i < words.length; i++) {
		words[i] = words[i].replace(re, '');	// strip punctuation

		// if relevant, add stem
		if (!isStopWord(words[i])) {
			var stem = porterStemmer.stem(words[i]);
			stems.push(stem);

			// update frequency
			if (!scores[stem]) scores[stem] = 0;
			scores[stem]++;

			// update maximum frequency
			if (!max || scores[stem] > max) {
				max = scores[stem];
			}
		}
	}

	// record stems in db
	con.query('INSERT IGNORE INTO stems (stem) VALUES ?;', [chunk(stems, 1)], function(err, rows) {
		if (!err) {
			// get uid's
			con.query('SELECT uid, stem FROM stems WHERE FIND_IN_SET(stem, ?);', [stems.join(',')], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					// finalize scores
					var insertScores = [];
					for (var i = 0; i < rows.length; i++) {
						insertScores.push([rows[i].uid, uid, scores[rows[i].stem] / max]);
					}

					// insert scores
					con.query('INSERT INTO scores (stem_uid, post_uid, score) VALUES ?;', [insertScores], function(err, rows) {});
				}
			});
		}
	});
}






















// ---------------------------------- TESTING -------------------------------------------------------------

// debug oauth
app.get('/testauth', function(req, res) {
	res.send(req.user || "You are not authenticated.");
});