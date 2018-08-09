
/* 
	search.js: Search page routes and all search engine functionality
*/

var porterStemmer = require('./porterstemmer.js');
var chunk = require('lodash.chunk');
var auth = require('./auth.js');
var con = require('./database.js').connection;
var settings = require('./settings.js').search;

module.exports = {
	init: function(app) {
		// field search query and render results
		app.post('/search', function(req, res) {
			// cue up default render object
			var render = auth.defaultRender(req);

			// add query to template
			render.query = req.body.query;

			// parse constraint on number of answers
			var answerConstraint = module.exports.parseAnswerConstraint(req.body.answeredStatus);

			if (req.body.category == 0) req.body.category = undefined;

			// parse page number from request
			render.page = parseInt(req.body.page, 10);
			if (isNaN(render.page) || render.page < 1) render.page = 1;

			// calculate starting index for retrieving posts for this page
			var startIndex = (render.page - 1) * settings.resultsPerPage;

			// pull question categories for rendering search filters
			con.query('SELECT * FROM categories;', function(err, categories) {
				if (!err && categories !== undefined && categories.length > 0) {
					render.categories = categories;

					// register which category filter was last applied (if any)
					for (var i = 0; i < categories.length; i++) {
						if (categories[i].uid == req.body.category) {
							categories[i].isSelected = true;
							break;
						}
					}
				}

				// register which answer filter was used
				render[req.body.answeredStatus] = true;

				// check query for user constraint ("user:uid"), and extract if found
				module.exports.parseUserConstraint(req.body.query, function(data) {

					// parse query once user constraint has been extracted
					var query = module.exports.parseQuery(data.query);
					var userUID = data.userUID;

					// search by query if possible
					if (query) {

						// count total number of search results
						con.query('CALL query_count(?, ?, ?, ?, ?);', [query, req.body.category, userUID, answerConstraint, settings.maxNumResults], function(err, rows) {
							if (!err && rows !== undefined && rows.length > 0 && rows[0].length > 0) {
								module.exports.formatPageInfo(render, rows[0][0].count);
							}

							// run actual search query
							con.query('CALL query(?, ?, ?, ?, ?, ?);', [query, req.body.category, userUID, answerConstraint, startIndex, settings.resultsPerPage], function(err, rows) {
								if (!err && rows !== undefined && rows.length > 0) {
									module.exports.formatResults(render, rows[0]);
								}

								res.render('search.html', render);
							});
						});

					// search only by constraints if they exist
					} else {
						// count total number of search results
						con.query('CALL noquery_count(?, ?, ?, ?);', [req.body.category, userUID, answerConstraint, settings.maxNumResults], function(err, rows) {
							if (!err && rows !== undefined && rows.length > 0 && rows[0].length > 0) {
								module.exports.formatPageInfo(render, rows[0][0].count);
							}

							// run actual search without query
							con.query('CALL noquery(?, ?, ?, ?, ?);', [req.body.category, userUID, answerConstraint, startIndex, settings.resultsPerPage], function(err, rows) {
								if (!err && rows !== undefined && rows.length > 0) {
									module.exports.formatResults(render, rows[0]);
								}

								res.render('search.html', render);
							});
						});
					}
				});
			});
		});

		// render search page with recent questions
		app.get('/search', function(req, res) {
			var render = auth.defaultRender(req);
			render.page = 1;	// default to first page of results

			// get categories for filters
			con.query('SELECT * FROM categories;', function(err, categories) {
				if (!err && categories !== undefined && categories.length > 0) {
					render.categories = categories;
				}

				// count total number of search results
				con.query('CALL noquery_count(?, ?, ?, ?);', [null, null, 0, settings.maxNumResults], function(err, rows) {
					if (!err && rows !== undefined && rows.length > 0 && rows[0].length > 0) {
						module.exports.formatPageInfo(render, rows[0][0].count);
					}

					// run actual search without query
					con.query('CALL noquery(?, ?, ?, ?, ?);', [null, null, 0, 0, settings.resultsPerPage], function(err, rows) {
						if (!err && rows !== undefined && rows.length > 0) {
							module.exports.formatResults(render, rows[0]);
						}

						res.render('search.html', render);
					});
				});
			});
		});

		return module.exports;
	},

	// given free text query, extract UID of user constraint ("user:uid") if exists, and strip query of this constraint
	parseUserConstraint: function(q, callback) {
		var userRe = /user:([0-9]+)/g;	// regex to match user constraint syntax
		var userConstraint;

		var userUID = userRe.exec(q);	// check for user constraint in query
		if (q) q = q.replace(userRe, '');	// strip query of user constraint text

		// if user constraint was found
		if (userUID) {
			// return stripped query and user uid
			callback({
				query: q,
				userUID: userUID[1]
			});
		} else {
			// apply no user constraint
			callback({
				query: q,
				userUID: undefined
			});
		}
	},

	// parse the answered status constraint from a search request
	parseAnswerConstraint: function(status) {
		if (status == "Unanswered") {
			return undefined;
		} else if (status == "Answered") {
			return 1;
		} else {
			return 0;
		}
	},

	// strip free text query of punctuation and stem words
	parseQuery: function(q) {
		if (q) {
			// regex to match non-alphabetic and non-space chars
			var re = /[^a-zA-Z ]/g;
			var query = [];

			var words = q.replace(re, '');	// strip of non-alphabetic punctuation / symbols
			words = words.replace(/\s+/g, ' '); 	// eliminate trailing whitespace
			words = words.toLowerCase().split(' ');	// bring to lower case and split into words

			// filter out stop words, stem query terms
			for (var i = 0; i < words.length; i++) {
				// check for empty strings (sometimes caused by splitting by spaces)
				if (words[i] != '') {
					query.push(porterStemmer.stem(words[i]) + '*');
				}
			}

			// join into acceptable SQL format by concatenating together with commas
			return query.join(' ');
		} else {
			return undefined;
		}
	},

	// add page number array and other page-related info to page template
	formatPageInfo: function(render, totalResults) {
		// generate array of possible pages for this search
		render.pages = Array.apply(null, {length: Math.ceil(totalResults / settings.resultsPerPage) + 1}).map(Function.call, Number);
		render.pages.shift();

		// get references to previous and following page numbers
		if (render.page < render.pages.length) render.nextPage = render.page + 1;
		if (render.page - 1 > 0) render.prevPage = render.page - 1;
	},

	// add results to page template
	formatResults: function(render, results) {
		// put search results into template object
		render.results = results;

		// register count of results showing on this page
		render.onThisPage = render.results.length;

		// register that results exist if any found
		if (render.results.length > 0) render.hasResults = true;
	}
}