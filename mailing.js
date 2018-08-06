
/* 
	mailing.js: Handles all emailing functionality
*/

var auth = require('./auth.js');
var creds = require('./credentials.js');
var con = require('./database.js').connection;
var nodemailer = require('nodemailer');
var nodeschedule = require('node-schedule');
var mustache = require('mustache');
var moment = require('moment');
var fs = require('fs');

// create gmail mail-sender 
var transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: creds.emailUsername,
		pass: creds.emailPassword
	}
});

var templates = {};

// read email templates
fs.readFile('./views/mailingtemplates.html', 'UTF8', function(err, data) {
	if (!err) {
		// email templates are in one file, separated using ~ as delimiter
		data = data.split('~');

		// extract email templates for different messages
		templates = {
			questionSubNotification: data[0],
			categorySubSuccess: data[1],
			categoryUnsubSuccess: data[2],
			categoryDigest: data[3]
		};
	}
});

module.exports = {
	// set up routes
	init: function(app) {
		// add a new user subscription to a question
		app.post('/subscribeToQuestion', auth.isAuthenticated, function(req, res) {
			if (req.user.local.uid && req.body.questionUID) {
				// ensure question exists
				con.query('SELECT COUNT(*) AS count FROM posts WHERE uid = ?;', [req.body.questionUID], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0 && rows[0].count == 1) {
						// add new subscription to db
						con.query('INSERT INTO question_subs (user_uid, question_uid) VALUES (?, ?);', [req.user.local.uid, req.body.questionUID], function(err, rows) {
							if (!err) {
								res.send({ success: 1 });
							} else {
								res.send({ success: 0 });
							}
						});
					} else {
						res.send({ success: 0 });
					}
				})
			} else {
				res.send({ success: 0 });
			}
		});

		// unsubscribe a user from a question
		app.post('/unsubscribeToQuestion', auth.isAuthenticated, function(req, res) {
			if (req.user.local.uid && req.body.questionUID) {
				con.query('DELETE FROM question_subs WHERE user_uid = ? AND question_uid = ?;', [req.user.local.uid, req.body.questionUID], function(err, rows) {
					if (!err) {
						res.send({ success: 1 });
					} else {
						res.send({ success: 0 });
					}
				});
			} else {
				res.send({ success: 0 });
			}
		});

		// check if you are subscribed to a question
		app.post('/isSubscribedToQuestion', auth.isAuthenticated, function(req, res) {
			if (req.body.questionUID) {
				// check for subscription link with this user UID and question UID
				con.query('SELECT COUNT(*) AS count FROM question_subs WHERE user_uid = ? AND question_uid = ?;', [req.user.local.uid, req.body.questionUID], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0 && rows[0].count == 1) {
						res.send({ isSubscribed: 1 });
					} else {
						res.send({ isSubscribed: 0 });
					}
				});
			}
		});

		// add a new user subscription to a category
		app.post('/subscribeToCategory', auth.isAuthenticated, function(req, res) {
			if (req.user.local.uid && req.body.categoryUID) {
				// ensure that category exists
				con.query('SELECT COUNT(*) AS count FROM categories WHERE uid = ?;', [req.body.categoryUID], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0 && rows[0].count == 1) {
						// add new category subscription to db
						con.query('INSERT INTO category_subs (user_uid, category_uid) VALUES (?, ?);', [req.user.local.uid, req.body.categoryUID], function(err, rows) {
							if (!err) {
								res.send({ success: 1 });

								// send email confirming successful subscription
								module.exports.confirmCategorySub(req.user.local.uid, req.body.categoryUID);
							} else {
								res.send({ success: 0 });
							}
						});
					} else {
						res.send({ success: 0 });
					}
				});
			} else {
				res.send({ success: 0 });
			}
		});

		// unsubscribe a user from a category
		app.post('/unsubscribeToCategory', auth.isAuthenticated, function(req, res) {
			if (req.user.local.uid && req.body.categoryUID) {
				con.query('DELETE FROM category_subs WHERE user_uid = ? AND category_uid = ?;', [req.user.local.uid, req.body.categoryUID], function(err, rows) {
					if (!err) {
						res.send({ success: 1 });

						// send email confirming successful unsubscription
						module.exports.confirmCategoryUnsub(req.user.local.uid, req.body.categoryUID);
					} else {
						res.send({ success: 0 });
					}
				});
			} else {
				res.send({ success: 0 });
			}
		});

		// get subscription management page for this user
		app.get('/subscriptions', auth.restrictAuth, function(req, res) {
			var render = auth.defaultRender(req);

			// select all categories, noting which ones the user is currently subscribed to
			con.query('SELECT categories.name, categories.uid, CASE WHEN category_subs.uid IS NULL THEN NULL ELSE 1 END AS isSubscribed FROM categories LEFT JOIN category_subs ON categories.uid = category_subs.category_uid AND category_subs.user_uid = ? WHERE categories.is_archived = 0;', [req.user.local.uid], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					render.categories = rows;
				}
				res.render('subscriptions.html', render);
			});
		});

		return module.exports;
	},

	// send a message to an individual account
	sendMail: function(options) {
		// set up message info (options should use: to (recipient address), subject (email subject), text (plaintext message), html (formatted message))
		var mailOptions = Object.assign(options, {
			from: creds.emailUsername
		});

		// use transporter to send mail
		transporter.sendMail(mailOptions, function(err, info){
			if (err) {
				console.log(err);
			}
		});
	},

	// send a bulk mail
	sendGroupMail: function(receivers, options) {
		// set up message info (use bcc to hide recipient emails)
		var mailOptions = Object.assign(options, {
			from: creds.emailUsername,
			to: [],
			bcc: receivers.join(', ')
		});

		// use transporter to send mail
		transporter.sendMail(mailOptions, function(err, info){
			if (err) {
				console.log(err);
			}
		});
	},

	// add a new question subscription link
	addNewQuestionSub: function(userUID, questionUID) {
		con.query('INSERT INTO question_subs (user_uid, question_uid) VALUES (?, ?);', [userUID, questionUID], function(err, rows) {});
	},

	// send group mail to question subscribers updating that activity has occurred on a question
	updateQuestionSubscribers: function(questionUID, answererUID, answerBody) {
		// prep render object
		var render = {
			questionUID: questionUID,
			answererUID: answererUID,
			answerBody: answerBody.substring(0, 200),
			domain: creds.domain
		};

		// get original post info
		con.query('SELECT posts.title AS title, users.display_name AS username, users.uid AS uid FROM posts JOIN users ON posts.owner_uid = users.uid WHERE posts.uid = ?;', [questionUID], function(err, rows) {
			if (!err && rows !== undefined && rows.length > 0) {
				render.questionTitle = rows[0].title;
				render.askerName = rows[0].username;
				render.askerUID = rows[0].uid;

				// get answerer name
				con.query('SELECT display_name FROM users WHERE uid = ?;', [answererUID], function(err, rows) {
					if (!err & rows !== undefined && rows.length > 0) {
						render.answererName = rows[0].display_name;

						// get emails of all users who subscribe to this question
						con.query('SELECT users.email FROM users JOIN question_subs ON users.uid = question_subs.user_uid WHERE question_subs.question_uid = ?;', [questionUID], function(err, rows) {
							if (!err && rows !== undefined && rows.length > 0) {
								var subscribers = [];
								// fetch subscriber emails
								for (var i = 0; i < rows.length; i++) {
									subscribers.push(rows[i].email);
								}

								if (templates.questionSubNotification) {
									// configure subscription message
									var options = {
										subject: "[Question Subscription] " + render.questionTitle,
										text: "",
										html: mustache.render(templates.questionSubNotification, render)
									}

									// send group mail notification
									module.exports.sendGroupMail(subscribers, options);
								}
							}
						});
					}
				});
			}
		});
	},

	// send email updating user that they have successfully been subscribed to a category
	confirmCategorySub: function(userUID, categoryUID) {
		// get user's email
		con.query('SELECT email FROM users WHERE uid = ?;', [userUID], function(err, rows) {
			if (!err && rows !== undefined && rows.length > 0) {
				var email = rows[0].email;

				// get category name by ID
				con.query('SELECT name FROM categories WHERE uid = ?;', [categoryUID], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0) {

						if (templates.categorySubSuccess) {
							// configure message settings / content
							var options = {
								to: email,
								subject: "Successfully subscribed to " + rows[0].name + "!",
								text: "",
								html: mustache.render(templates.categorySubSuccess, {
									category: rows[0].name
								})
							};

							// send confirmation email
							module.exports.sendMail(options);
						}
					}
				});
			}
		});
	},

	// send email updating user that they have successfully been unsubscribed from a category
	confirmCategoryUnsub: function(userUID, categoryUID) {
		// get user's email
		con.query('SELECT email FROM users WHERE uid = ?;', [userUID], function(err, rows) {
			if (!err && rows !== undefined && rows.length > 0) {
				var email = rows[0].email;

				// get category name by ID
				con.query('SELECT name FROM categories WHERE uid = ?;', [categoryUID], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0) {

						if (templates.categoryUnsubSuccess) {
							// configure message settings / content
							var options = {
								to: email,
								subject: "Successfully unsubscribed from " + rows[0].name + "!",
								text: "",
								html: mustache.render(templates.categoryUnsubSuccess, {
									category: rows[0].name
								})
							};

							// send confirmation email
							module.exports.sendMail(options);
						}
					}
				});
			}
		});
	},

	// send category digests to all category subscribers
	sendAllCategoryDigests: function() {
		// object to map category uid's to info / emails / posts
		var categories = {};

		// get all category subscription links
		con.query('SELECT users.email, categories.name AS category_name, category_subs.category_uid FROM category_subs JOIN users ON category_subs.user_uid = users.uid JOIN categories ON category_subs.category_uid = categories.uid;', function(err, rows) {
			if (!err && rows !== undefined && rows.length > 0) {

				// construct objects for each category containing cat name, and list of subscriber objects
				for (var i = 0; i < rows.length; i++) {
					if (!categories[rows[i].category_uid]) {
						categories[rows[i].category_uid] = {
							uid: rows[i].category_uid,
							name: rows[i].category_name,
							emails: [rows[i].email],
						};
					} else {
						categories[rows[i].category_uid].emails.push(rows[i].email);
					}
				}

				// calculate date one day ago
				var cutoff = moment().subtract(1, 'days').format('YYYY-MM-DD HH:mm');

				// get all posts posted in the past day
				con.query('SELECT posts.*, users.display_name AS owner_name FROM posts JOIN users ON posts.owner_uid = users.uid WHERE posts.creation_date > ?;', cutoff, function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0) {
						// for each post
						for (var i = 0; i < rows.length; i++) {
							// if relevant category to subscriptions
							if (rows[i].category_uid in categories) {
								// format creation date 
								rows[i].creation_date = moment(rows[i].creation_date).fromNow();
								// trim post body to use as preview
								rows[i].body = rows[i].body.substring(0, 200);

								if (!categories[rows[i].category_uid].posts) {
									categories[rows[i].category_uid].posts = [rows[i]];
								} else {
									categories[rows[i].category_uid].posts.push(rows[i])
								}
							}
						}

						// send each category's digest using the relevant posts
						for (var uid in categories) {
							if (categories.hasOwnProperty(uid)) {
								module.exports.sendDigest(categories[uid]);
							}
						}
					}
				});
			}
		});
	},

	// send group email for a category subscription
	sendDigest(categoryInfo) {
		if (templates.categoryDigest && categoryInfo.posts) {
			categoryInfo.domain = creds.domain;

			var date = moment().format('M/D/YY');

			// configure subscription message
			var options = {
				subject: "[" + categoryInfo.name + " " + date + "] New questions from " + categoryInfo.name + "!",
				text: "",
				html: mustache.render(templates.categoryDigest, categoryInfo)
			}

			// send group mail notification
			module.exports.sendGroupMail(categoryInfo.emails, options);
		}
	}
}

// every morning at 4 AM, send category digests
nodeschedule.scheduleJob('0 0 4 * * *', module.exports.sendAllCategoryDigests);