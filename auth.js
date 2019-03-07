
/* 
	auth.js: Authentication routes / configurations and middleware for restricting pages / requests to various levels of authentication
*/

var GoogleStrategy = require('passport-google-oauth20').Strategy;
var querystring = require('querystring');
var con = require('./database.js').connection;
var creds = require('./credentials.js');

module.exports = {

	// set up routes and configure authentication settings
	init: function(app, passport) {

		// cache user info from our system into their session
		passport.serializeUser(function(user, done) {
			// lookup user in system
			con.query('SELECT * FROM users WHERE email = ?;', [user._json.email], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					user.local = rows[0];

					// check for profile image update
					var img = user._json.picture; // module.exports.stripImageURL(user._json.image.url);
					if (img != user.local.image_url) {
						// apply updates to session and in db
						user.local.image_url = img;
						con.query('UPDATE users SET image_url = ? WHERE uid = ?;', [img, user.local.uid], function(err, rows) {});
					}

					// ensure real name recorded
					if (user.local.real_name == undefined) {
						user.local.real_name = module.exports.getRealName(user);
						con.query('UPDATE users SET real_name = ? WHERE uid = ?;', [user.local.real_name, user.local.uid], function(err, rows) {});
					}

					done(null, user);

				// if not existing user but email domain legitimate
				} else if (/.+?@(students\.)?stab\.org/.test(user._json.email)) {
					var real = module.exports.getRealName(user);

					// create new user
					con.query('CALL create_user(?, ?, ?);', [user._json.email, real, user._json.picture], function(err, rows) {
						if (!err && rows !== undefined && rows.length > 0 && rows[0].length > 0) {
							// update their cached info in session
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

		// Google OAuth2 config with passport
		passport.use(new GoogleStrategy({
				clientID:		creds.GOOGLE_CLIENT_ID,
				clientSecret:	creds.GOOGLE_CLIENT_SECRET,
				callbackURL:	creds.domain + "/auth/google/callback",
				passReqToCallback: true,

				// tells passport to use userinfo endpoint instead of Google+
				userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
			},
			function(request, accessToken, refreshToken, profile, done) {
				process.nextTick(function () {
					return done(null, profile);
				});
			}
		));

		app.use(passport.initialize());
		app.use(passport.session());

		// authentication with google endpoint
		app.get('/auth/google', module.exports.checkReturnTo, passport.authenticate('google', { scope: [
				'profile',
				'email'
			]
		}));

		// callback for google auth
		app.get('/auth/google/callback',
			passport.authenticate('google', {
				successReturnToOrRedirect: '/',
				failureRedirect: '/failure'
		}));

		// handler for failure to authenticate
		app.get('/failure', function(req, res) {
			res.render('error.html', { message: "Unable to authenticate." });
		});

		// logout handler
		app.get('/logout', module.exports.checkReturnTo, function(req, res){
			req.logout();
			res.redirect(req.session.returnTo || '/');
		});

		return module.exports;
	},

	// get first name, last initial as real name for identity theft purposes
	getRealName: function(user) {
		return user.name.givenName + ' ' + user.name.familyName[0];
	},

	// get image URL without ?sz=50 (size format)
	stripImageURL: function(url) {
		var patt = new RegExp(".+(?=\\?sz)");
		return patt.exec(url);
	},

	// middleware to check for a URL to return to after authenticating
	checkReturnTo: function(req, res, next) {
		var returnTo = req.query['returnTo'];
		if (returnTo) {
			req.session = req.session || {};
			req.session.returnTo = querystring.unescape(returnTo);
		}
		next();
	},

	// middleware to restrict pages to authenticated users
	restrictAuth: function(req, res, next) {
		// if authenticated and has session data from our system
		if (req.isAuthenticated() && req.user.local) {
			return next();
		} else {
			res.redirect('/auth/google?returnTo=' + querystring.escape(req.url));
		}
	},

	// middleware to restrict pages to admin users
	restrictAdmin: function(req, res, next) {
		// if authenticated and has session data
		if (req.isAuthenticated() && req.user.local) {
			// if administrator, allow
			if (req.user.local.is_admin) {
				return next();
			} else {
				res.redirect('/');
			}
		} else {
			res.redirect('/auth/google?returnTo=' + querystring.escape(req.url));
		}
	},

	// middleware (for POST reqs) to check if auth'd
	isAuthenticated: function(req, res, next) {
		if (req.isAuthenticated() && req.user.local) {
			return next();
		} else {
			res.redirect('/');
		}
	},

	// middleware (for POSTs) to check if requester is admin
	isAdmin: function(req, res, next) {
		if (req.isAuthenticated() && req.user.local && req.user.local.is_admin == 1) {
			return next();
		} else {
			res.redirect('/');
		}
	},

	// generate render object for most pages (authentication info for navbar)
	defaultRender: function(req) {
		if (req.user && req.user.local) {
			return {
				loggedIn: req.isAuthenticated(),
				username: req.user.local.display_name,
				user_uid: req.user.local.uid,
				myProfileImg: req.user.local.image_url
			}
		} else {
			return {
				loggedIn: req.isAuthenticated()
			};
		}
	},

	// generate standard render object for error page (auth info + error message)
	errorRender: function(req, message) {
		if (req.user && req.user.local) {
			return {
				loggedIn: req.isAuthenticated(),
				username: req.user.local.display_name,
				user_uid: req.user.local.uid,
				myProfileImg: req.user.local.image_url,
				message: message
			}
		} else {
			return {
				loggedIn: req.isAuthenticated(),
				message: message
			};
		}
	}
}