
/* 
	mailing.js: Handles all emailing functionality
*/

var auth = require('./auth.js');
var creds = require('./credentials.js');
var con = require('./database.js').connection;
var nodemailer = require('nodemailer');
var mustache = require('mustache');
var fs = require('fs');

// create gmail mail-sender 
var transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: creds.emailUsername,
		pass: creds.emailPassword
	}
});

var questionSubEmail;
fs.readFile('./views/questionsubemail.html', 'UTF8', function(err, data) {
	if (!err) {
		questionSubEmail = data;
	}
});

module.exports = {
	// set up routes
	init: function(app) {
		// add a new user subscription to a question
		app.post('/subscribeToQuestion', auth.isAuthenticated, function(req, res) {
			if (req.body.userUID == req.user.local.uid && req.body.questionUID) {
				con.query('INSERT INTO question_subs (user_uid, question_uid) VALUES (?, ?);', [req.body.userUID, req.body.questionUID], function(err, rows) {
					if (!err) {
						res.send({ success: 1 });
					} else {
						res.send({ success: 0 });
					}
				});
			}
		});

		// unsubscribe a user from a question
		app.post('/unsubscribeToQuestion', auth.isAuthenticated, function(req, res) {
			if (req.body.userUID == req.user.local.uid && req.body.questionUID) {
				con.query('DELETE FROM question_subs WHERE user_uid = ? AND question_uid = ?;', [req.body.userUID, req.body.questionUID], function(err, rows) {
					if (!err) {
						res.send({ success: 1 });
					} else {
						res.send({ success: 0 });
					}
				});
			}
		});

		// add a new user subscription to a category
		app.post('/subscribeToCategory', auth.isAuthenticated, function(req, res) {
			if (req.body.userUID == req.user.local.uid) {
				
			}
		});

		// unsubscribe a user from a category
		app.post('/unsubscribeToCategory', auth.isAuthenticated, function(req, res) {
			if (req.body.userUID == req.user.local.uid) {
				
			}
		});

		return module.exports;
	}

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

								if (questionSubEmail) {
									// configure subscription message
									var options = {
										subject: "[Question Subscription] " + render.questionTitle,
										text: "",
										html: mustache.render(questionSubEmail, render)
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
	}
}