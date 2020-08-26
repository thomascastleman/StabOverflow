
/*
	settings.js: Important constants related to system functionality
*/

var moment = require('moment');

module.exports = {

	// search settings
	search: {
		resultsPerPage: 25,	// number of search results per each page
		maxNumResults: 300	// maximum number of total results yielded by a search request (this should be > resultsPerPage)
	},

	// user search settings
	userSearch: {
		usersPerPage: 25,	// number of user search results per page
		maxNumResults: 300	// maximum number of total results yielded for a user search
	},

	// visitor-related settings
	visitor: {
		numQuestionsOnLanding: 50,		// number of recent questions shown on the landing page
		numPostsOnUserPage: 15			// number of posts shown in the "Recent Posts" section of each user page
	},

	// CRON string specifying when to send category digest emails
	// See: https://www.npmjs.com/package/node-schedule#cron-style-scheduling
	// NOTE: digests will only be sent if there are new posts for that category 
	// within the window (see digests_window)
	digests_cron_string: '0 0 4 * * *',	// daily at 4am

	// Moment duration indicating how far back the mailing system should look
	// for new posts to include in category digests
	// See: https://momentjs.com/docs/#/durations/
	digests_window: moment.duration(1, 'days'),

	port: 8080
}