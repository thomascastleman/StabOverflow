
DROP DATABASE IF EXISTS staboverflow;
CREATE DATABASE staboverflow;

USE staboverflow;

-- all user accounts
CREATE TABLE users (
	uid INT NOT NULL AUTO_INCREMENT,
	email VARCHAR(45),
	real_name VARCHAR(32),
	display_name VARCHAR(32),
	image_url VARCHAR(500),
	bio VARCHAR(140),
	is_admin TINYINT(1) DEFAULT 0,
	PRIMARY KEY (uid)
);

-- admin-defined categories under which to post
CREATE TABLE categories (
	uid INT NOT NULL AUTO_INCREMENT,
	name VARCHAR(32),
	is_archived TINYINT(1) DEFAULT 0,
	PRIMARY KEY (uid)
);

-- all questions and answers
CREATE TABLE posts (
	uid INT NOT NULL AUTO_INCREMENT,
	parent_question_uid INT,
	type TINYINT(1),	-- implicitly "is question" (0 --> answer, 1 --> question)
	category_uid INT,
	owner_uid INT,
	creation_date DATETIME DEFAULT NOW(),
	answer_count INT DEFAULT 0,
	upvotes INT DEFAULT 0,
	title TEXT,
	body TEXT,
	PRIMARY KEY (uid),
	FOREIGN KEY (category_uid) REFERENCES categories(uid),
	FOREIGN KEY (owner_uid) REFERENCES users(uid)
);

-- create index on posts body for search engine
CREATE FULLTEXT INDEX posts_index ON posts(title, body);

-- all comments
CREATE TABLE comments (
	uid INT NOT NULL AUTO_INCREMENT,
	parent_uid INT,
	parent_question_uid INT,
	owner_uid INT,
	creation_date DATETIME DEFAULT NOW(),
	body TEXT,
	PRIMARY KEY (uid),
	FOREIGN KEY (parent_uid) REFERENCES posts(uid) ON DELETE CASCADE,
	FOREIGN KEY (parent_question_uid) REFERENCES posts(uid) ON DELETE CASCADE,
	FOREIGN KEY (owner_uid) REFERENCES users(uid)
);

-- which users have upvoted which posts (prevent double-counting upvotes)
CREATE TABLE upvotes (
	uid INT NOT NULL AUTO_INCREMENT,
	post_uid INT,
	user_uid INT,
	PRIMARY KEY (uid),
	FOREIGN KEY (post_uid) REFERENCES posts(uid) ON DELETE CASCADE,
	FOREIGN KEY (user_uid) REFERENCES users(uid)
);

-- -- word stems from posts (search engine)
-- CREATE TABLE stems (
-- 	uid INT NOT NULL AUTO_INCREMENT,
-- 	stem VARCHAR(16) UNIQUE,
-- 	PRIMARY KEY (uid)
-- );

-- -- stem scoring with posts (search engine)
-- CREATE TABLE scores (
-- 	uid INT NOT NULL AUTO_INCREMENT,
-- 	stem_uid INT,
-- 	post_uid INT,
-- 	score FLOAT,
-- 	PRIMARY KEY (uid),
-- 	FOREIGN KEY (stem_uid) REFERENCES stems(uid),
-- 	FOREIGN KEY (post_uid) REFERENCES posts(uid) ON DELETE CASCADE
-- );

-- relation between users and categories: user subscribes to category
CREATE TABLE category_subs (
	uid INT NOT NULL AUTO_INCREMENT,
	category_uid INT,
	user_uid INT,
	PRIMARY KEY(uid),
	UNIQUE (category_uid, user_uid),
	FOREIGN KEY (category_uid) REFERENCES categories(uid) ON DELETE CASCADE,
	FOREIGN KEY (user_uid) REFERENCES users(uid)
);

-- relation between users and questions: user subscribes to notifications about this question
CREATE TABLE question_subs (
	uid INT NOT NULL AUTO_INCREMENT,
	question_uid INT,
	user_uid INT,
	PRIMARY KEY (uid),
	UNIQUE (question_uid, user_uid),
	FOREIGN KEY (question_uid) REFERENCES posts(uid) ON DELETE CASCADE,
	FOREIGN KEY (user_uid) REFERENCES users(uid)
);

-- add new user and return their information
DELIMITER //;
CREATE PROCEDURE create_user (IN user_email VARCHAR(45), IN user_name VARCHAR(32), IN image VARCHAR(500))
BEGIN
	INSERT INTO users (email, real_name, display_name, image_url) VALUES (user_email, user_name, user_name, image);
	SELECT * FROM users WHERE uid = LAST_INSERT_ID();
END;
//;

-- create new question and get its uid for redirection
DELIMITER //;
CREATE PROCEDURE create_question (IN category_uid INT, IN owner_uid INT, IN title TEXT, IN body TEXT)
BEGIN
	INSERT INTO posts (type, category_uid, owner_uid, title, body) VALUES (1, category_uid, owner_uid, title, body);
	UPDATE posts SET parent_question_uid = uid WHERE uid = LAST_INSERT_ID();
	SELECT LAST_INSERT_ID() AS redirect_uid;
END;
//;

-- create new answer update answer_count of parent, return uid
DELIMITER //;
CREATE PROCEDURE create_answer (IN parent_question_uid INT, IN owner_uid INT, IN body TEXT)
BEGIN
	INSERT INTO posts (type, parent_question_uid, owner_uid, body) VALUES (0, parent_question_uid, owner_uid, body);
	UPDATE posts SET answer_count = answer_count + 1 WHERE uid = parent_question_uid;
	SELECT LAST_INSERT_ID() AS answer_uid;
END;
//;

-- use query to get relevant question posts
-- 	textquery: the query to be searched with
-- 	category_constraint: uid of category to restrict to, if null no restriction
-- 	user_constraint: uid of user to restrict to, if null no restriction
-- 	min_answers: minimum number of answers on a result, if null then unanswered only (e.g. answered only = 1, all = 0)
DELIMITER //;
CREATE PROCEDURE query(IN textquery VARCHAR(65535), IN category_constraint INT, IN user_constraint INT, IN min_answers INT, IN start_index INT, IN num_results INT)
BEGIN
	SELECT * FROM (
		SELECT *, SUM(MATCH (title, body) AGAINST (textquery IN BOOLEAN MODE)) as score
		FROM posts
		WHERE MATCH (title, body) AGAINST (textquery IN BOOLEAN MODE)
		GROUP BY parent_question_uid
	) AS all_results WHERE
		(category_uid = category_constraint OR category_constraint IS NULL)
		AND (owner_uid = user_constraint OR user_constraint IS NULL)
		AND ((min_answers IS NOT NULL AND answer_count >= min_answers) OR (min_answers IS NULL AND answer_count = 0))
	ORDER BY score DESC
	LIMIT start_index, num_results;
END;
//;

DELIMITER ;

-- -- get posts relevant to query ordered by score
-- DELIMITER //
-- CREATE PROCEDURE query(IN q VARCHAR(65535), IN category_filter VARCHAR(65535), IN answer_filter VARCHAR(65535), IN user_constraint VARCHAR(65535), IN num_results INT)
-- BEGIN
--     SET @query = CONCAT ("
--     	SELECT redirect_uid, SUM(score) AS score, title, preview, owner_uid, owner_real, owner_display, image_url, creation_date, answer_count, upvotes, category FROM (
-- 			SELECT 
-- 					scores.score,
-- 					q.uid AS redirect_uid,
-- 					q.title,
-- 					SUBSTRING(q.body, 1, 200) AS preview,
-- 					q.owner_uid,
-- 					users.real_name AS owner_real,
-- 					users.display_name AS owner_display,
-- 					users.image_url,
-- 					DATE_FORMAT(q.creation_date, '%b %D, %Y at %l:%i %p') AS creation_date,
-- 					q.answer_count,
-- 					q.upvotes,
-- 					c.name AS category
-- 			FROM
-- 				stems JOIN scores ON stems.uid = scores.stem_uid
-- 				JOIN posts p ON scores.post_uid = p.uid
-- 				JOIN posts q ON p.parent_question_uid = q.uid OR (p.type = 1 AND p.uid = q.uid)
-- 				JOIN users ON q.owner_uid = users.uid
-- 				LEFT JOIN categories c ON q.category_uid = c.uid
-- 				WHERE 
-- 					stems.stem IN (", q, ")", category_filter, answer_filter, user_constraint, ") AS results 
-- 		GROUP BY redirect_uid 
-- 		ORDER BY score DESC
-- 		LIMIT ", num_results, ";");
-- 	PREPARE stmt FROM @query;
--     EXECUTE stmt;
--     DEALLOCATE PREPARE stmt;
-- END //


-- -- search posts without a query; only filter by category and/or answered status
-- DELIMITER //
-- CREATE PROCEDURE noquery(IN category_filter VARCHAR(65535), IN answer_filter VARCHAR(65535), IN user_constraint VARCHAR(65535), IN num_results INT)
-- BEGIN
-- 	SET @query = CONCAT("
-- 		SELECT 
-- 			q.uid AS redirect_uid, 
-- 			q.title,
-- 			SUBSTRING(q.body, 1, 200) AS preview,
-- 			q.owner_uid,
-- 			users.real_name AS owner_real,
-- 			users.display_name AS owner_display,
-- 			users.image_url,
-- 			DATE_FORMAT(q.creation_date, '%b %D, %Y at %l:%i %p') AS creation_date,
-- 			q.upvotes, 
-- 			q.answer_count, 
-- 			c.name AS category 
-- 		FROM 
-- 			posts q LEFT JOIN categories c ON q.category_uid = c.uid
-- 			JOIN users ON q.owner_uid = users.uid
-- 		WHERE q.type = 1", category_filter, answer_filter, user_constraint, " 
-- 		ORDER BY q.uid DESC
-- 		LIMIT ", num_results, ";");
-- 	PREPARE stmt FROM @query;
-- 	EXECUTE stmt;
-- 	DEALLOCATE PREPARE stmt;
-- END //