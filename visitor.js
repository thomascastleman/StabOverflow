
/* 
	visitor.js: Routes for any functionality not restricted to authenticated users (except search)
*/

var moment = require('moment');
var auth = require('./auth.js');
var con = require('./database.js').connection;

module.exports = {

	// set up routes
	init: function(app, mdConverter) {

		// important constants
		var settings = {
			numQuestionsOnLanding: 50,		// number of recent questions shown on the landing page
			numPostsOnUserPage: 20			// number of posts shown in the "Recent Posts" section of each user page
		};

		// get landing page
		app.get('/', function(req, res) {
			var render = auth.defaultRender(req);

			// pull the most recent questions
			con.query('SELECT posts.*, categories.name AS category, users.real_name AS owner_real, users.display_name AS owner_display FROM posts LEFT OUTER JOIN categories ON posts.category_uid = categories.uid JOIN users ON posts.owner_uid = users.uid WHERE posts.type = 1 ORDER BY posts.uid DESC LIMIT ?;', [settings.numQuestionsOnLanding], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {

					// format the time posted into an "n minutes ago" sort of format
					for (var i = 0; i < rows.length; i++) {
						rows[i].when_asked = moment(rows[i].creation_date).fromNow();
						delete rows[i].creation_date;
						if (rows[i].category_uid == null) rows[i].noCategory = true;
					}

					render.questions = rows;
				}

				res.render('landingpage.html', render);
			});
		});

		// get user profile
		app.get('/users/:id', function(req, res) {
			var render = auth.defaultRender(req);

			// get user corresponding to UID
			con.query('SELECT * FROM users WHERE uid = ?;', [req.params.id], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					render = Object.assign(rows[0], render);
					
					// check if user is visiting their own user page
					render.ownProfile = render.loggedIn && req.user.local.uid == req.params.id;

					// count questions and answers by this user
					con.query('SELECT SUM(CASE WHEN type = 1 THEN 1 ELSE 0 END) questionCount, SUM(CASE WHEN type = 0 THEN 1 ELSE 0 END) answerCount FROM posts WHERE owner_uid = ?;', [req.params.id], function(err, rows) {
						if (!err && rows !== undefined && rows.length > 0) {
							render.questions_asked = rows[0].questionCount ? rows[0].questionCount : 0;
							render.answers_given = rows[0].answerCount ? rows[0].answerCount : 0;
						}

						// get recent questions and answers by this user
						con.query('SELECT IFNULL(p.parent_question_uid, p.uid) AS redirect_uid, IFNULL(q.title, p.title) AS title, p.type AS isQuestion, DATE_FORMAT(p.creation_date, "%M %D, %Y") date FROM posts p LEFT JOIN posts q ON p.parent_question_uid = q.uid WHERE p.owner_uid = ? ORDER BY p.uid DESC LIMIT ?;', [req.params.id, settings.numPostsOnUserPage], function(err, rows) {
							if (!err && rows !== undefined && rows.length > 0) {
								// convert to boolean
								for (var i = 0; i < rows.length; i++) {
									rows[i].isQuestion = !!rows[i].isQuestion;
								}

								render.posts = rows;
								render.hasPosts = true;
							}

							res.render('user.html', render);
						});
					});
				} else {
					res.render('error.html', auth.errorRender(req, "User not found."));
				}
			});
		});

		// get individual question page
		app.get('/questions/:id', function(req, res) {
			var render = auth.defaultRender(req);
			var ansIDtoIndex = {}, ans, question_uid = req.params.id;
			render.question_uid = question_uid;

			// check if post exists & get its data
			con.query('SELECT posts.*, categories.name AS category, users.real_name AS owner_real, users.display_name AS owner_display, users.image_url FROM posts LEFT OUTER JOIN categories ON posts.category_uid = categories.uid JOIN users ON posts.owner_uid = users.uid WHERE posts.uid = ? AND type = 1 LIMIT 1;', [question_uid], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					render = Object.assign(rows[0], render);

					// format creation date
					render.creation_date = moment(render.creation_date).format('MMM Do, YYYY [at] h:mm A');

					// check if admin, if owns question
					render.isAdmin = render.loggedIn ? req.user.local.is_admin : false;
					if (render.loggedIn) render.isQuestionOwner = render.owner_uid == req.user.local.uid;

					// convert question markdown to HTML
					render.body = mdConverter.makeHtml(render.body);

					// compensate for lack of category
					if (render.category_uid == null) render.noCategory = true;

					// get associated answers, highest upvotes first
					con.query('SELECT posts.*, users.real_name AS owner_real, users.display_name AS owner_display, users.image_url FROM posts JOIN users ON posts.owner_uid = users.uid WHERE parent_question_uid = ? ORDER BY upvotes DESC;', [question_uid], function(err, rows) {
						if (!err && rows !== undefined && rows.length > 0) {
							render.answers = rows;

							// for each child answer
							for (var i = 0; i < render.answers.length; i++) {
								ans = render.answers[i];

								ans.body = mdConverter.makeHtml(ans.body);	// convert answer body to HTML
								ansIDtoIndex[ans.uid] = i;	// record answer UID to index
								ans.answer_uid = ans.uid;	// add UID under name 'answer_uid'

								// check if user is owner of this answer
								if (render.loggedIn) ans.isOwner = (ans.owner_uid == req.user.local.uid);

								// format creation date
								ans.creation_date = moment(ans.creation_date).format('MMM Do, YYYY [at] h:mm A');
							}
						}

						// get associated comments (question and answer comments for this UID)
						con.query('SELECT comments.*, users.real_name AS owner_real, users.display_name AS owner_display FROM comments JOIN users ON comments.owner_uid = users.uid WHERE parent_question_uid = ?;', [question_uid], function(err, rows) {
							if (!err && rows !== undefined && rows.length > 0) {
								render.comments = [];

								// assign comments to their parent posts
								for (var i = 0; i < rows.length; i++) {
									// format creation date
									rows[i].creation_date = moment(rows[i].creation_date).format('h:mm A, MMM Do');

									// attach comment to either question or parent answer using the recorded indexes of the answers
									if (rows[i].parent_uid == question_uid) {
										// add question comment to section for question comments
										render.comments.push(rows[i]);
									} else {
										// attach answer comment to parent answer
										ans = render.answers[ansIDtoIndex[rows[i].parent_uid]];
										if (!ans.answer_comments) ans.answer_comments = [];
										ans.answer_comments.push(rows[i]);
									}
								}
							}

							// render full question page
							res.render('question.html', render);
						});
					});
				} else {
					// question not found, send not found page
					res.render('error.html', auth.errorRender(req, "Question not found."));
				}
			});
		});
	}
}