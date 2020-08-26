
/* 
	mailing.js: Handles all emailing functionality
*/

var settings = require('./settings.js');
var auth = require('./auth.js');
var creds = require('./credentials.js');
var con = require('./database.js').connection;
var nodeschedule = require('node-schedule');
var mustache = require('mustache');
var moment = require('moment');
var fs = require('fs');
var mailgun = require('mailgun-js')({ 
	apiKey: creds.MAILGUN_API_KEY, 
	domain: creds.MAILGUN_DOMAIN 
});

var templates = {};

// read email templates
fs.readFile('./views/mailingtemplates.html', 'UTF8', function(err, data) {
	if (!err) {
		// email templates are in one file, separated using ~ as delimiter
		data = data.split('~');

		// extract email templates for different messages
		templates = {
			newAnswerNotification: data[0],
			newEditsNotification: data[1],
			categorySubSuccess: data[2],
			categoryUnsubSuccess: data[3],
			categoryDigest: data[4]
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
				// remove question subscription link
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
			var render = auth.defaultRender(req);	// prepare default render object

			// select all categories, noting which ones the user is currently subscribed to
			con.query('SELECT categories.name, categories.uid, CASE WHEN category_subs.uid IS NULL THEN NULL ELSE 1 END AS isSubscribed FROM categories LEFT JOIN category_subs ON categories.uid = category_subs.category_uid AND category_subs.user_uid = ? WHERE categories.is_archived = 0;', [req.user.local.uid], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					// attach unarchived categories to render object
					render.categories = rows;
				}
				res.render('subscriptions.html', render);
			});
		});

		return module.exports;
	},

	// send a message to an individual account
	sendMail: function(options) {
		// set up mailing options (should use: to (recipient address), 
		// subject (email subject), text (plaintext message), html (formatted message))
		var mailOptions = Object.assign(options, {
			from: creds.MAILGUN_FROM_ADDRESS
		});

		// send the mail
		mailgun.messages().send(mailOptions, (err, body) => {
			if (err) console.log(err);
		});
	},

	// send a bulk mail
	sendGroupMail: function(receivers, options) {
		let recipientVars = {};

		// map each 'to' address to an empty object
		for (let i = 0; i < receivers.length; i++) {
			recipientVars[receivers[i]] = {};
		}

		recipientVars = JSON.stringify(recipientVars);

		// Set up mailing options
		// We use recipient variables to act like bcc, so 
		// receivers cannot see each other's email addresses
		var mailOptions = Object.assign(options, {
			'from': creds.MAILGUN_FROM_ADDRESS,
			'to': receivers.join(','),
			'recipient-variables': recipientVars
		});

		// send the mail
		mailgun.messages().send(mailOptions, (err, body) => {
			if (err) console.log(err);
		});
	},

	// add a new question subscription link
	addNewQuestionSub: function(userUID, questionUID) {
		// insert the question subscription link
		con.query('INSERT INTO question_subs (user_uid, question_uid) VALUES (?, ?);', [userUID, questionUID], function(err, rows) {});
	},

	// send group mail to question subscribers updating that a new answer has been posted on a question they subscribe to
	notifyNewAnswer: function(questionUID, answererUID, answerBody) {
		// prep render object
		var render = {
			questionUID: questionUID,
			answererUID: answererUID,
			answerBody: answerBody.substring(0, 200),
			domain: creds.domain
		};

		// get original post info
		con.query('SELECT posts.title AS title, posts.creation_date AS creation_date, users.display_name AS username, users.uid AS uid, users.image_url AS image_url FROM posts JOIN users ON posts.owner_uid = users.uid WHERE posts.uid = ?;', [questionUID], function(err, rows) {
			if (!err && rows !== undefined && rows.length > 0) {
				// add info to render object
				render.questionTitle = rows[0].title;
				render.askerName = rows[0].username;
				render.askerUID = rows[0].uid;
				render.creation_date = moment(rows[0].creation_date).format('MMM Do, YYYY [at] h:mm A');
				render.image_url = rows[0].image_url;

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

								if (templates.newAnswerNotification) {
									// configure subscription message
									var options = {
										subject: "[New Answer] " + render.questionTitle,
										text: "",
										html: mustache.render(templates.newAnswerNotification, render)
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

	// send group email to question subscribers updating that edits have been made to a question they subscribe to
	notifyNewEdits: function(askerUID, questionUID, title, appendage) {
		// prepare render object
		var render = {
			askerUID: askerUID,
			questionUID: questionUID,
			questionTitle: title,
			appendage: appendage.substring(0, 200),
			domain: creds.domain,
			edit_date: moment().format('MMM Do, YYYY [at] h:mm A')
		};

		// get editor info
		con.query('SELECT display_name, image_url FROM users WHERE uid = ?;', [askerUID], function(err, rows) {
			if (!err && rows !== undefined && rows.length > 0) {
				render.askerName = rows[0].display_name;
				render.image_url = rows[0].image_url;
			}

			// get emails of all users who subscribe to this question
			con.query('SELECT users.email FROM users JOIN question_subs ON users.uid = question_subs.user_uid WHERE question_subs.question_uid = ?;', [questionUID], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					var subscribers = [];
					// fetch subscriber emails
					for (var i = 0; i < rows.length; i++) {
						subscribers.push(rows[i].email);
					}

					// if template exists
					if (templates.newEditsNotification) {
						// configure subscription message
						var options = {
							subject: "[New Edits] " + render.questionTitle,
							text: "",
							html: mustache.render(templates.newEditsNotification, render)
						}

						// send group mail notification
						module.exports.sendGroupMail(subscribers, options);
					}
				}
			});
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
									category: rows[0].name,
									domain: creds.domain
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
									category: rows[0].name,
									domain: creds.domain
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

	// send category digests for every category to all category subscribers
	sendAllCategoryDigests: function() {
		// object to map category uid's to info / emails / posts
		var categories = {};

		// get all category subscription links
		con.query('SELECT users.email, categories.name AS category_name, category_subs.category_uid FROM category_subs JOIN users ON category_subs.user_uid = users.uid JOIN categories ON category_subs.category_uid = categories.uid;', function(err, rows) {
			if (!err && rows !== undefined && rows.length > 0) {

				// construct objects for each category containing cat name, and list of subscriber emails
				for (var i = 0; i < rows.length; i++) {
					if (!categories[rows[i].category_uid]) {
						// if no existing object, add a new one, record category uid, name, and list of subscriber emails
						categories[rows[i].category_uid] = {
							uid: rows[i].category_uid,
							name: rows[i].category_name,
							emails: [rows[i].email],
						};
					} else {
						// if object for this category already exists, just add this user to the list of emails
						categories[rows[i].category_uid].emails.push(rows[i].email);
					}
				}

				// calculate how far back to look for new posts
				var cutoff = moment().subtract(settings.digests_window).format('YYYY-MM-DD HH:mm');

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

								// add to category object's list of post data
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
		// if email template as well as new posts under this category exist
		if (templates.categoryDigest && categoryInfo.posts) {
			categoryInfo.domain = creds.domain;

			// get today's date
			var date = moment().format('M/D/YY');

			// configure subscription message
			var options = {
				subject: "[Digest] [" + categoryInfo.name + " " + date + "] New Questions from " + categoryInfo.name + "!",
				text: "",
				html: mustache.render(templates.categoryDigest, categoryInfo)
			}

			// send group mail notification
			module.exports.sendGroupMail(categoryInfo.emails, options);
		}
	}
}

// schedule category digests at time interval specified by cron string
nodeschedule.scheduleJob(settings.digests_cron_string, module.exports.sendAllCategoryDigests);