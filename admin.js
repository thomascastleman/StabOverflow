
/* 
	admin.js: Routes for administrator portal and any special administrator functionality 
*/

var auth = require('./auth.js');
var con = require('./database.js').connection;

module.exports = {

	// set up admin routes
	init: function(app) {
		// render interface for admin to make special changes
		app.get('/adminPortal', auth.restrictAdmin, function(req, res) {
			var render = auth.defaultRender(req);

			// get all categories (for deletion)
			con.query('SELECT * FROM categories;', function(err, categories) {
				if (!err && categories !== undefined && categories.length > 0) {
					render.categories = categories;
					render.loadedAllCategories = true;
				}

				// get only unarchived categories (for archive)
				con.query('SELECT * FROM categories WHERE is_archived = 0;', function(err, unarchived) {
					if (!err && unarchived !== undefined && unarchived.length > 0) {
						render.unarchived = unarchived;
						render.loadedUnarchived = true;
					}

					// get user info (for authorizing / deauthorizing admins)
					con.query('SELECT uid, email, is_admin, IFNULL(real_name, display_name) AS name FROM users;', function(err, rows) {
						if (!err && rows !== undefined && rows.length > 0) {
							render.users = rows;
						}

						res.render('adminportal.html', render);
					});
				});
			});
		});

		// manually add account to system
		app.post('/addAccount', auth.isAdmin, function(req, res) {
			var render = auth.defaultRender(req);

			// check for an email conflict with an existing user
			con.query('SELECT COUNT(*) AS count FROM users WHERE email = ?;', [req.body.email], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					// if no conflict found
					if (rows[0].count == 0) {
						// insert new user into system
						con.query('INSERT INTO users (email, display_name) VALUES (?, ?);', [req.body.email, req.body.name], function(err, rows) {
							if (!err) {
								// report success back to administrator
								render.message = "Successfully added user \"" + req.body.name + "\" with email \"" + req.body.email + "\"!";
								res.render('adminsuccess.html', render);
							} else {
								res.render('error.html', auth.errorRender(req, "There was a problem adding the new user."));
							}
						});
					} else {
						res.render('error.html', auth.errorRender(req, "\"" + req.body.email + "\" caused a conflict with an existing email."));
					}
				} else {
					res.render('error.html', auth.errorRender(req, undefined));
				}
			});
		});

		// make user admin by posting email
		app.post('/makeAdmin', auth.isAdmin, function(req, res) {
			var render = auth.defaultRender(req);

			// check if user with this email exists
			con.query('SELECT * FROM users WHERE email = ?;', [req.body.email], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					// apply updated privileges by uid from previous query
					con.query('UPDATE users SET is_admin = 1 WHERE uid = ?;', [rows[0].uid], function(err, rows) {
						if (!err) {
							// report success back to administrator
							render.message = "Successfully promoted \"" + req.body.email + "\" to admin status!";
							res.render('adminsuccess.html', render);
						} else {
							res.render('error.html', auth.errorRender(req, "Failed to make \"" + req.body.email + "\" an admin."));
						}
					});
				} else {
					res.render('error.html', auth.errorRender(req, "User with email \"" + req.body.email + "\" does not exist."));
				}
			});
		});

		// remove user's admin privileges by posting email
		app.post('/removeAdmin', auth.isAdmin, function(req, res) {
			// safety: prevent admin from removing themself
			if (req.body.email != req.user.local.email) {
				var render = auth.defaultRender(req);

				// verify that user exists
				con.query('SELECT * FROM users WHERE email = ?;', [req.body.email], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0) {
						// apply demotion
						con.query('UPDATE users SET is_admin = 0 WHERE uid = ?;', [rows[0].uid], function(err, rows) {
							if (!err) {
								// report success back to administrator
								render.message = "Successfully revoked the admin privileges of \"" + req.body.email + "\"!";
								res.render('adminsuccess.html', render);
							} else {
								res.render('error.html', auth.errorRender(req, "Failed to remove admin privileges from \"" + req.body.email + "\"."));
							}
						});
					} else {
						res.render('error.html', auth.errorRender(req, "User with email \"" + req.body.email + "\" does not exist."));
					}
				});
			} else {
				res.render('error.html', auth.errorRender(req, "You are unable to deauthorize yourself."));
			}
		});

		// create a new category
		app.post('/newCategory', auth.isAdmin, function(req, res) {
			var render = auth.defaultRender(req);

			// add new category
			con.query('INSERT INTO categories (name) VALUES (?);', [req.body.category], function(err, rows) {
				if (!err) {
					// report success
					render.message = "Successfully created the category \"" + req.body.category + "\"!";
					res.render('adminsuccess.html', render);
				} else {
					res.render('error.html', auth.errorRender(req, "Failed to add category \"" + req.body.category + "\"."));
				}
			});
		});

		// archive an existing category by uid
		app.post('/archiveCategory', auth.isAdmin, function(req, res) {
			if (req.body.uid) {
				var render = auth.defaultRender(req);

				// archive category
				con.query('UPDATE categories SET is_archived = 1 WHERE uid = ?;', [req.body.uid], function(err, rows) {
					if (!err) {
						// get name of archived category to report back
						con.query('SELECT * FROM categories WHERE uid = ?;', [req.body.uid], function(err, rows) {
							if (!err && rows !== undefined && rows.length > 0) {
								render.message = "Successfully archived the category \"" + rows[0].name + "\"!";
							} else {
								render.message = "Successfully archived category."
							}

							res.render('adminsuccess.html', render);
						});
					} else {
						res.render('error.html', auth.errorRender(req, "Failed to archive category."));
					}
				});
			} else {
				res.redirect('/');
			}
		});

		// fully delete an existing category
		app.post('/deleteCategory', auth.isAdmin, function(req, res) {
			if (req.body.uid) {
				var render = auth.defaultRender(req), category;

				// get category name
				con.query('SELECT * FROM categories WHERE uid = ?;', [req.body.uid], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0) {
						category = rows[0].name;

						// reset category to null of all posts with this category
						con.query('UPDATE posts SET category_uid = NULL WHERE category_uid = ?;', [req.body.uid], function(err, rows) {
							if (!err) {
								// full delete category
								con.query('DELETE FROM categories WHERE uid = ?;', [req.body.uid], function(err, rows) {
									if (!err) {
										// report success
										render.message = "Successfully deleted the category \"" + category + "\"!";
										res.render('adminsuccess.html', render);
									} else {
										res.render('error.html', auth.errorRender(req, "Failed to delete category \"" + category + "\"."));
									}
								});
							} else {
								res.render('error.html', auth.errorRender(req, "Failed to remove category \"" + category + "\" from posts."));
							}
						});
					} else {
						res.render('error.html', auth.errorRender(req, "Unable to delete. This category does not exist."));
					}
				});
			} else {
				res.redirect('/');
			}
		});

		// remove a post
		app.post('/deletePost', auth.isAdmin, function(req, res) {
			// remove post from system (ON DELETE CASCADE will remove most child data)
			con.query('DELETE FROM posts WHERE uid = ?;', [req.body.uid], function(err, rows) {
				if (!err) {
					res.redirect('/adminPortal');

					if (req.body.parent_question_uid) {
						// if deleted post was answer, update parent question's answer count
						con.query('UPDATE posts SET answer_count = CASE WHEN answer_count > 0 THEN answer_count - 1 ELSE 0 END WHERE uid = ?;', [req.body.parent_question_uid], function(err, rows) {});
					} else {
						// delete child answer posts (not handled by delete cascade)
						con.query('DELETE FROM posts WHERE parent_question_uid = ?;', [req.body.uid], function(err, rows) {});
					}
				} else {
					res.render('error.html', auth.errorRender(req, "Failed to remove post."));
				}
			});
		});

		// remove a comment
		app.post('/deleteComment', auth.isAdmin, function(req, res) {
			// delete comment by uid
			con.query('DELETE FROM comments WHERE uid = ?;', [req.body.uid], function(err, rows) {
				if (!err) {
					res.redirect('/adminPortal');
				} else {
					res.render('error.html', auth.errorRender(req, "Failed to delete comment."));
				}
			});
		});
	}
}