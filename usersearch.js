
/* 
	usersearch.js: User search page routes
*/

var auth = require('./auth.js');
var con = require('./database.js').connection;
var settings = require('./settings.js').userSearch;

module.exports = {

	// set up routes
	init: function(app) {

		// field get request to user search page
		app.get('/search/users', function(req, res) {
			var render = auth.defaultRender(req);	// default render object

			// default to first page
			render.page = 1;

			// just pull all users
			con.query('SELECT * FROM users LIMIT ?;', [settings.maxNumResults], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					module.exports.prepRender(render, rows, 0, settings.usersPerPage);
				}

				res.render('usersearch.html', render);
			});
		});

		// field search for user, render results
		app.post('/search/users', function(req, res) {
			// prepare default render object
			var render = auth.defaultRender(req);

			// parse page number from request
			render.page = parseInt(req.body.page, 10);
			if (isNaN(render.page) || render.page < 1) render.page = 1;

			var startIndex = (render.page - 1) * settings.usersPerPage;	// calculate starting index for retrieving users for this page

			if (!req.body.query) req.body.query = '';	// check for empty query

			render.query = '%' + req.body.query.replace(/\s+/g, " ") + '%';	// strip excess whitespace and format for SQL

			// get users with similar names to query
			con.query("SELECT * FROM users WHERE real_name LIKE ? OR display_name LIKE ? LIMIT ?;", [render.query, render.query, settings.maxNumResults], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					// prepare page
					module.exports.prepRender(render, rows, startIndex, settings.usersPerPage);
				}

				render.query = render.query.replace(/%/g, "");	// reformat query
				res.render('usersearch.html', render);
			});

		});

		return module.exports;
	},

	// calculate page info and extract single page of search results
	prepRender: function(render, fullResults, start, perPage) {
		// calculate number of pages for full results
		var totalPages = Math.ceil(fullResults.length / perPage);

		// generate array of possible pages for this search
		render.pages = Array.apply(null, {length: totalPages + 1}).map(Function.call, Number);
		render.pages.shift();

		// get references to previous and following page numbers
		if (render.page < render.pages.length) render.nextPage = render.page + 1;
		if (render.page - 1 > 0) render.prevPage = render.page - 1;

		// extract single page
		render.results = fullResults.slice(start, start + perPage);

		// send count of results showing on this page
		render.onThisPage = render.results.length;

		// register that results exist if any found
		if (render.results.length > 0) render.hasResults = true;
	}
}