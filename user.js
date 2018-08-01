
/* 
	user.js: Routes for any functionality restricted to authenticated users only
*/

var moment = require('moment');
var auth = require('./auth.js');
var con = require('./database.js').connection;
var search = require('./search.js');

module.exports = {

	// set up routes
	init: function(app, mdConverter) {

		// ask a question page, restricted
		app.get('/ask', auth.restrictAuth, function(req, res) {
			var render = auth.defaultRender(req);

			// get all unarchived categories to allow them to post under
			con.query('SELECT * FROM categories WHERE is_archived = 0;', function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					render.categories = rows;
				}
				res.render('ask.html', render);
			});
		});

		// request UI for editing user profile
		app.get('/users/edit/:id', auth.restrictAuth, function(req, res) {
			var render = auth.defaultRender(req);

			// ensure editing OWN profile
			if (req.user.local.uid == req.params.id) {
				// pull user data
				con.query('SELECT * FROM users WHERE uid = ?;', [req.user.local.uid], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0) {
						render = Object.assign(rows[0], render);
						res.render('editprofile.html', render);
					} else {
						res.render('error.html', auth.errorRender(req, "There was a problem accessing user information."));
					}
				});
			} else {
				res.render('error.html', auth.errorRender(req, "You do not have authorization to edit this profile."));
			}
		});

		// request UI for editing existing post
		app.get('/editPost/:id', auth.restrictAuth, function(req, res) {
			var render = auth.defaultRender(req);

			// ensure editing own post
			con.query('SELECT title, body FROM posts WHERE uid = ? AND owner_uid = ?;', [req.params.id, req.user.local.uid], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {

					// render post data
					res.render('editpost.html', Object.assign({
						uid: req.params.id,
						title: rows[0].title,
						body: mdConverter.makeHtml(rows[0].body)
					}, render));
				} else {
					res.render('error.html', auth.errorRender(req, "Unable to edit: failed to retrive post information."));
				}
			});
		});

		// receive a new question or answer
		app.post('/newPost', auth.isAuthenticated, function(req, res) {
			// check for empty request
			if (req.body.body != '' && (req.body.title != '' || req.body.type == 0)) {
				// if post is question
				if (req.body.type == 1) {
					// check uncategorized (id == 0 or null)
					req.body.category_uid = parseInt(req.body.category_uid, 10);
					if (isNaN(req.body.category_uid)) req.body.category_uid = null;

					// insert question into posts
					con.query('CALL create_question(?, ?, ?, ?);', [req.body.category_uid, req.user.local.uid, req.body.title, req.body.body], function(err, rows) {
						if (!err && rows !== undefined && rows.length > 0 && rows[0].length > 0) {
							search.indexPost(rows[0][0].redirect_uid, req.body.title, req.body.body);	// index the new question
							res.redirect('/questions/' + rows[0][0].redirect_uid);	// redirect to this question's page
						} else {
							res.render('error.html', auth.errorRender(req, "Failed to post question."));
						}
					});

				// if post is answer
				} else if (req.body.type == 0) {
					// if legitimate parent question id
					if (!isNaN(parseInt(req.body.parent_question, 10))) {
						// insert answer into posts
						con.query('CALL create_answer(?, ?, ?);', [req.body.parent_question, req.user.local.uid, req.body.body], function(err, rows) {
							if (!err && rows !== undefined && rows.length > 0 && rows[0].length > 0) {
								search.indexPost(rows[0][0].answer_uid, "", req.body.body);	// index the new answer
								res.redirect('/questions/' + req.body.parent_question);	// redirect to parent question's page
							} else {
								res.render('error.html', auth.errorRender(req, "Failed to post answer."));
							}
						});
					} else {
						res.render('error.html', auth.errorRender(req, "Unable to add post: invalid parent question information."));
					}
				} else {
					res.render('error.html', auth.errorRender(req, "Unable to add post: post not marked as question or answer."));
				}
			} else {
				res.render('error.html', auth.errorRender(req, "Unable to add empty post."));
			}
		});

		// receive a new comment
		app.post('/newComment', auth.isAuthenticated, function(req, res) {
			// check if request is legitimate
			if (req.body.body != '' && !isNaN(parseInt(req.body.parent_question, 10)) && !isNaN(parseInt(req.body.parent_uid, 10))) {
				// insert new comment
				con.query('INSERT INTO comments (parent_uid, parent_question_uid, body, owner_uid) VALUES (?, ?, ?, ?);',
					[req.body.parent_uid, req.body.parent_question, req.body.body, req.user.local.uid], function(err, rows) {

					// redirect to relevant question page
					if (!err) {
						res.redirect('/questions/' + req.body.parent_question);
					} else {
						res.render('error.html', auth.errorRender(req, "Failed to post comment."));
					}
				});
			} else {
				res.redirect('/');
			}
		});

		// append to an existing post
		app.post('/updatePost', auth.isAuthenticated, function(req, res) {
			// avoid empty appendage
			if (req.body.appendage != '' && !isNaN(parseInt(req.body.uid, 10))) {
				// ensure editing own post
				con.query('SELECT type, parent_question_uid FROM posts WHERE uid = ? AND owner_uid = ?;', [req.body.uid, req.user.local.uid], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0) {

						// format editing message to record time of edit
						var editMessage = '\n\n<br>*Edited ' + moment().format('h:mm A M/D/YYYY') + ':*\n\n';

						// apply edits
						con.query('UPDATE posts SET body = concat(body, ?) WHERE uid = ?;', [editMessage + req.body.appendage, req.body.uid], function(err, rows2) {
							if (!err) {
								// redirect to edited post
								var redirect_uid = rows[0].type == 1 ? req.body.uid : rows[0].parent_question_uid
								res.redirect(redirect_uid ? '/questions/' + redirect_uid : '/');

								// index new appendage
								search.indexPost(req.body.uid, "", req.body.appendage);
							} else {
								res.render('error.html', auth.errorRender(req, "Failed to apply edits to post"));
							}
						});
					} else {
						res.render('error.html', auth.errorRender(req, "You are unable to edit this post."));
					}
				});
			} else {
				res.render('error.html', auth.errorRender(req, "Failed to apply edits (empty appendage)."));
			}
		});

		// receive request to upvote a post, send back delta to change post's count by in UI
		app.post('/upvote', auth.isAuthenticated, function(req, res) {
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
									// no change in upvotes
									res.send({ delta: 0 });
								}
							});
						} else {
							// no change in upvotes
							res.send({ delta: 0 });
						}
					} else {
						// no change in upvotes
						res.send({ delta: 0 });
					}
				});
			} else {
				// no change in upvotes
				res.send({ delta: 0 });
			}
		});

		// apply updates to a user's profile
		app.post('/users/update', auth.isAuthenticated, function(req, res) {
			var uid = req.body.uid, name = req.body.display_name, bio = req.body.bio;

			// check uid is legitimate and name is non-empty
			if (!isNaN(parseInt(uid, 10)) && name != "") {
				// if user is authorized to make edits
				if (uid == req.user.local.uid) {
					con.query('UPDATE users SET display_name = ?, bio = ? WHERE uid = ?;', [name, bio, req.user.local.uid], function(err, rows) {
						if (!err) {
							// update session info
							req.user.local.display_name = name;
							req.user.local.bio = bio;
							
							// send back to updated user page
							res.redirect('/users/' + req.user.local.uid);
						} else {
							res.render('error.html', auth.errorRender(req, "Failed to update user information."));
						}
					});
				} else {
					res.render('error.html', auth.errorRender(req, "You are not allowed to edit this user's information."));
				}
			} else {
				res.render('error.html', auth.errorRender(req, "Unable to edit user information: invalid request information."));
			}
		});

	}
}