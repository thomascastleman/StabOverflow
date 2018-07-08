
var auth = require('./auth.js');
var con = require('./database.js').connection;

module.exports = {
	init: function(app) {
		// allow admin to make special changes
		app.get('/adminPortal', auth.restrictAdmin, function(req, res) {
			var render = auth.defaultRender(req);

			// get all categories (for delete)
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
					con.query('SELECT email, is_admin, IFNULL(real_name, display_name) AS name FROM users;', function(err, rows) {
						if (!err && rows !== undefined && rows.length > 0) {
							render.users = rows;
						}

						res.render('adminportal.html', render);
					});
				});
			});
		});

		// admin: add account to system manually
		app.post('/addAccount', auth.isAdmin, function(req, res) {
			var render = auth.defaultRender(req);
			con.query('SELECT COUNT(*) AS count FROM users WHERE email = ?;', [req.body.email], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					if (rows[0].count == 0) {
						// insert new user into table
						con.query('INSERT INTO users (email, display_name) VALUES (?, ?);', [req.body.email, req.body.name], function(err, rows) {
							if (!err) {
								render.message = "Successfully added user \"" + req.body.name + "\" with email \"" + req.body.email + "\"!";
								res.render('adminsuccess.html', render);
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
		app.post('/makeAdmin', auth.isAdmin, function(req, res) {
			var render = auth.defaultRender(req);
			con.query('SELECT * FROM users WHERE email = ?;', [req.body.email], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					// apply updated privileges
					con.query('UPDATE users SET is_admin = 1 WHERE uid = ?;', [rows[0].uid], function(err, rows) {
						if (!err) {
							render.message = "Successfully promoted \"" + req.body.email + "\" to admin status!";
							res.render('adminsuccess.html', render);
						} else {
							res.render('error.html', { message: "Failed to make '" + req.body.email + "' an admin." });
						}
					});
				} else {
					res.render('error.html', { message: "User with email \"" + req.body.email + "\" does not exist." });
				}
			});
		});

		// admin: remove user's admin privileges
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
								render.message = "Successfully revoked the admin privileges of \"" + req.body.email + "\"!";
								res.render('adminsuccess.html', render);
							} else {
								res.render('error.html', { message: "Failed to remove admin privileges from '" + req.body.email + "'" });
							}
						});
					} else {
						res.render('error.html', { message: "User with email \"" + req.body.email + "\" does not exist." });
					}
				});
			} else {
				res.render('error.html', { message: "You are unable to deauthorize yourself." });
			}
		});

		// admin: create a new category
		app.post('/newCategory', auth.isAdmin, function(req, res) {
			var render = auth.defaultRender(req);
			con.query('INSERT INTO categories (name) VALUES (?);', [req.body.category], function(err, rows) {
				if (!err) {
					render.message = "Successfully created the category \"" + req.body.category + "\"!";
					res.render('adminsuccess.html', render);
				} else {
					res.render('error.html', { message: "Failed to add category." });
				}
			});
		});

		// admin: archive an existing category by uid
		app.post('/archiveCategory', auth.isAdmin, function(req, res) {
			if (req.body.uid) {
				var render = auth.defaultRender(req);

				// archive category
				con.query('UPDATE categories SET is_archived = 1 WHERE uid = ?;', [req.body.uid], function(err, rows) {
					if (!err) {
						con.query('SELECT * FROM categories WHERE uid = ?;', [req.body.uid], function(err, rows) {
							if (!err && rows !== undefined && rows.length > 0) {
								render.message = "Successfully archived the category \"" + rows[0].name + "\"!";
							} else {
								render.message = "Successfully archived category."
							}
							res.render('adminsuccess.html', render);
						});
					} else {
						res.render('error.html', { message: "Failed to archive category." });
					}
				});
			} else {
				res.redirect('/');
			}
		});

		// admin: fully delete an existing category
		app.post('/deleteCategory', auth.isAdmin, function(req, res) {
			if (req.body.uid) {
				var render = auth.defaultRender(req), category;
				con.query('SELECT * FROM categories WHERE uid = ?;', [req.body.uid], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0) {
						category = rows[0].name;

						// flush all posts with this category
						con.query('UPDATE posts SET category_uid = NULL WHERE category_uid = ?;', [req.body.uid], function(err, rows) {
							if (!err) {
								// full delete actual category
								con.query('DELETE FROM categories WHERE uid = ?;', [req.body.uid], function(err, rows) {
									if (!err) {
										render.message = "Successfully deleted the category \"" + category + "\"!";
										res.render('adminsuccess.html', render);
									} else {
										res.render('error.html', { message: "Failed to delete category." });
									}
								});
							} else {
								res.render('error.html', { message: "Failed to remove category from posts." });
							}
						});
					} else {
						res.render('error.html', { message: "Unable to delete. This category does not exist." });
					}
				});
			} else {
				res.redirect('/');
			}
		});

		// admin: remove a post
		app.post('/deletePost', auth.isAdmin, function(req, res) {
			con.query('DELETE FROM posts WHERE uid = ?;', [req.body.uid], function(err, rows) {
				if (!err) {
					res.redirect('/adminPortal');

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
		app.post('/deleteComment', auth.isAdmin, function(req, res) {
			con.query('DELETE FROM comments WHERE uid = ?;', [req.body.uid], function(err, rows) {
				if (!err) {
					res.redirect('/adminPortal');
				} else {
					res.render('error.html', { message: "Failed to delete comment." });
				}
			});
		});
	}
}