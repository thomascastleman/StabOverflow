
/* 
	mailing.js: Handles all emailing functionality
*/

var creds = require('./credentials.js');
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
		// set up message info
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
	}
}