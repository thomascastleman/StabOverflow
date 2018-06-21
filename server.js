
var express 			= require('express');
var app 				= express();
var mustacheExpress 	= require('mustache-express');
var bodyParser 			= require('body-parser');
var cookieParser 		= require('cookie-parser');
var moment 				= require('moment');
var session 			= require('cookie-session');
var GoogleStrategy 		= require('passport-google-oauth2').Strategy;
var passport 			= require('passport');
var creds				= require('./credentials.js');

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.engine('html', mustacheExpress());
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + '/views'));

passport.serializeUser(function(user, done) {
	done(null, user);
});

passport.deserializeUser(function(user, done) {
	user.variable = "this is a test";
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

app.get('/auth/google', passport.authenticate('google', { scope: [
		'https://www.googleapis.com/auth/userinfo.profile',
		'https://www.googleapis.com/auth/userinfo.email'
	] 
}));

app.get('/auth/google/callback',
	passport.authenticate('google', {
		successRedirect: '/',
		failureRedirect: '/failure'
}));

app.get('/logout', function(req, res){
	req.logout();
	res.redirect('/');
});

var server = app.listen(8080, function() {
	console.log("StabOverflow server listening on port %d", server.address().port);
});



// templates testing:

app.get('/', function(req, res) {
	res.render('landingpage.html', {
		loggedIn: false,
		questions: [
			{
				uid: 1,
				title: "Test question no. 1?",
				upvotes: 24,
				answer_count: 1,
				owner_name: "Test Name",
				owner_uid: 314,
				category: "CSP",
				when_asked: "20 min ago",
			},
			{
				uid: 2,
				title: "Another test question?",
				upvotes: 16,
				answer_count: 0,
				owner_name: "User Number 2",
				owner_uid: 287,
				category: "HSE",
				when_asked: "46 min ago",
			}
		]
	});
});

app.get('/ask', function(req, res) {
	res.render('ask.html', {
		loggedIn: true,
		categories: [
			{ name: "CSP", uid: 1 },
			{ name: "HDS", uid: 2 },
			{ name: "HSE", uid: 3 }
		]
	});
});

app.post('/newPost', function(req, res) {
	res.send(req.body);
});

app.get('/questions/:id', function(req, res) {
	res.end(req.params.id);
});

app.get('/search', function(req, res) {
	res.render('search.html', {
		loggedIn: true,
		categories: [
			{ name: "CSP", uid: 1 },
			{ name: "HDS", uid: 2 },
			{ name: "HSE", uid: 3 }
		],
		results: [
			{
				uid: 1,
				title: "How do I do this?",
				upvotes: 24,
				answer_count: 1,
				owner_name: "Test Name",
				owner_uid: 314,
				category: "CSP",
				when_asked: "20 min ago",
			},
			{
				uid: 2,
				title: "What is the best way to ask a question?",
				upvotes: 16,
				answer_count: 0,
				owner_name: "User Number 2",
				owner_uid: 287,
				category: "HSE",
				when_asked: "46 min ago",
			}
		]
	});
});

app.post('/search', function(req, res) {
	res.send(req.body);
})

app.get('/users/:id', function(req, res) {
	res.render('user.html', {
		full_name: "Fake User",
		bio: "I am a fake user who is not actually real.",
		questions_asked: 36,
		answers_given: 12
	});
});