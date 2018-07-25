
/*
	settings.js: Important constants related to system functionality
*/

module.exports = {

	// search settings
	search: {
		resultsPerPage: 2,	// number of search results per each page
		maxNumResults: 300	// maximum number of total results yielded by a search request
	},

	// user search settings
	userSearch: {
		usersPerPage: 4,	// number of user search results per page
		maxNumResults: 300	// maximum number of total results yielded for a user search
	},

	// visitor-related settings
	visitor: {
		numQuestionsOnLanding: 50,		// number of recent questions shown on the landing page
		numPostsOnUserPage: 20			// number of posts shown in the "Recent Posts" section of each user page
	}
}