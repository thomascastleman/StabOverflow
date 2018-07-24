
/* 
	usersearch.js: User search page routes
*/

var auth = require('./auth.js');
var con = require('./database.js').connection;
var search = require('./search.js');

module.exports = {

	// set up routes
	init: function(app) {

		// important constants
		var settings = {
			usersPerPage: 4,	// number of results per page
			maxNumResults: 300	// maximum number of results yielded for a user search
		}

		// field get request to user search page
		app.get('/search/users', function(req, res) {
			var render = auth.defaultRender(req);	// default render object

			// default to first page
			render.page = 1;

			// just pull all users
			con.query('SELECT * FROM users LIMIT ?;', [settings.maxNumResults], function(err, rows) {
				if (!err && rows !== undefined && rows.length > 0) {
					search.prepRender(render, rows, 0, settings.usersPerPage);
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
					search.prepRender(render, rows, startIndex, settings.usersPerPage);
				}

				render.query = render.query.replace(/%/g, "");	// reformat query
				res.render('usersearch.html', render);
			});

		});

		return module.exports;
	}
}