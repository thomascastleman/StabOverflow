
/* 
	mailing.js: Handles all emailing functionality
*/

var creds = require('./credentials.js');
var con = require('./database.js').connection;
var nodemailer = require('nodemailer');

// create gmail mail-sender 
var transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: creds.emailUsername,
		pass: creds.emailPassword
	}
});

module.exports = {
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
		// get original post info
		con.query('SELECT posts.title AS title, users.display_name AS username, users.uid AS uid FROM posts JOIN users ON posts.owner_uid = users.uid WHERE posts.uid = ?;', [questionUID], function(err, rows) {
			if (!err && rows !== undefined && rows.length > 0) {
				var questionTitle = rows[0].title;
				var askerName = rows[0].username;
				var askerUID = rows[0].uid;

				con.query('SELECT display_name FROM users WHERE uid = ?;', [answererUID], function(err, rows) {
					if (!err & rows !== undefined && rows.length > 0) {
						var answererName = rows[0].display_name;

						// get emails of all users who subscribe to this question
						con.query('SELECT users.email FROM users JOIN question_subs ON users.uid = question_subs.user_uid WHERE question_subs.question_uid = ?;', [questionUID], function(err, rows) {
							if (!err && rows !== undefined && rows.length > 0) {
								var subscribers = [];
								// fetch subscriber emails
								for (var i = 0; i < rows.length; i++) {
									subscribers.push(rows[i].email);
								}

								// configure subscription message
								var options = {
									subject: "[Question Subscription] " + questionTitle,
									text: "",
									html: "<h1><a href='" + creds.domain + "/questions/" + questionUID + "'>" + questionTitle + "</a></h1><h2>asked by <a href='" + creds.domain + "/users/" + askerUID + "'>" + askerName + "</a></h2><p>A new answer from <a href='" + creds.domain + "/users/" + answererUID + "'>" + answererName + "</a> has been posted:</p><p>" + answerBody.substring(0, 200) + "...</p>"
								}

								// send group mail notification
								module.exports.sendGroupMail(subscribers, options);
							}
						});
					}
				});
			}
		});
	}
}