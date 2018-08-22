
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
	creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	answer_count INT DEFAULT 0,
	upvotes INT DEFAULT 0,
	title TEXT,
	body TEXT,
	PRIMARY KEY (uid),
	FOREIGN KEY (category_uid) REFERENCES categories(uid),
	FOREIGN KEY (owner_uid) REFERENCES users(uid)
);

-- create index on posts title and body for search engine
CREATE FULLTEXT INDEX posts_index ON posts(title, body);

-- all comments
CREATE TABLE comments (
	uid INT NOT NULL AUTO_INCREMENT,
	parent_uid INT,
	parent_question_uid INT,
	owner_uid INT,
	creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
CREATE PROCEDURE create_question (IN category_uid INT, IN owner_uid INT, IN title TEXT, IN body TEXT)
BEGIN
	INSERT INTO posts (type, category_uid, owner_uid, title, body) VALUES (1, category_uid, owner_uid, title, body);
	UPDATE posts SET parent_question_uid = uid WHERE uid = LAST_INSERT_ID();
	SELECT LAST_INSERT_ID() AS redirect_uid;
END;
//;

-- create new answer update answer_count of parent, return uid
CREATE PROCEDURE create_answer (IN parent_q_uid INT, IN owner_uid INT, IN body TEXT)
BEGIN
	INSERT INTO posts (type, parent_question_uid, owner_uid, body) VALUES (0, parent_q_uid, owner_uid, body);
	UPDATE posts SET answer_count = answer_count + 1 WHERE uid = parent_q_uid;
	SELECT LAST_INSERT_ID() AS answer_uid;
END;
//;

-- use query to get relevant question posts
-- 		textquery: the query to be searched with
-- 		category_constraint: uid of category to restrict to, if null no restriction
-- 		user_constraint: uid of user to restrict to, if null no restriction
-- 		min_answers: minimum number of answers on a result, if null then unanswered only (e.g. answered only = 1, all = 0)
-- 		start_index: the index from which to return results
-- 		num_results: number of rows to return (maximum)
CREATE PROCEDURE query(IN textquery VARCHAR(65535), IN category_constraint INT, IN user_constraint INT, IN min_answers INT, IN start_index INT, IN num_results INT)
BEGIN
	SELECT * FROM (

		SELECT
			q.uid,
			q.title,
			SUBSTRING(q.body, 1, 200) AS body,
			q.owner_uid,
			DATE_FORMAT(q.creation_date, '%b %D, %Y at %l:%i %p') AS creation_date,
			q.answer_count,
			q.upvotes,
			q.category_uid,
			u.real_name AS owner_real,
			u.display_name AS owner_display,
			u.image_url, 
			c.name AS category, 
			SUM(MATCH (p.title, p.body) AGAINST (textquery IN BOOLEAN MODE)) as score
		FROM posts p 
			JOIN posts q ON p.parent_question_uid = q.uid
			JOIN users u ON q.owner_uid = u.uid
			LEFT JOIN categories c ON q.category_uid = c.uid
		WHERE MATCH (p.title, p.body) AGAINST (textquery IN BOOLEAN MODE)
		GROUP BY p.parent_question_uid

	) AS results WHERE
		(category_uid = category_constraint OR category_constraint IS NULL)
		AND (owner_uid = user_constraint OR user_constraint IS NULL)
		AND ((min_answers IS NOT NULL AND answer_count >= min_answers) OR (min_answers IS NULL AND answer_count = 0))
	ORDER BY score DESC
	LIMIT start_index, num_results;
END;
//;

-- count the full number of found results for a given query, with constraints applied (args same as query())
CREATE PROCEDURE query_count(IN textquery VARCHAR(65535), IN category_constraint INT, IN user_constraint INT, IN min_answers INT, IN max_results INT)
BEGIN
	SELECT COUNT(*) AS count FROM (

		SELECT 
			q.*
		FROM posts p 
			JOIN posts q ON p.parent_question_uid = q.uid
		WHERE MATCH (p.title, p.body) AGAINST (textquery IN BOOLEAN MODE)
		GROUP BY p.parent_question_uid
		LIMIT max_results

	) AS results WHERE
		(category_uid = category_constraint OR category_constraint IS NULL)
		AND (owner_uid = user_constraint OR user_constraint IS NULL)
		AND ((min_answers IS NOT NULL AND answer_count >= min_answers) OR (min_answers IS NULL AND answer_count = 0));
END;
//;

-- get any questions that satisfy a number of constraints, without using query
-- 		category_constraint: uid of category to restrict to, if null no restriction
-- 		user_constraint: uid of user to restrict to, if null no restriction
-- 		min_answers: minimum number of answers on a result, if null then unanswered only (e.g. answered only = 1, all = 0)
-- 		start_index: the index from which to return results
-- 		num_results: number of rows to return (maximum)
CREATE PROCEDURE noquery(IN category_constraint INT, IN user_constraint INT, IN min_answers INT, IN start_index INT, IN num_results INT)
BEGIN
	SELECT 
		p.uid,
		p.title,
		SUBSTRING(p.body, 1, 200) AS body,
		p.owner_uid,
		DATE_FORMAT(p.creation_date, '%b %D, %Y at %l:%i %p') AS creation_date,
		p.answer_count,
		p.upvotes,
		p.category_uid,
		u.real_name AS owner_real,
		u.display_name AS owner_display,
		u.image_url, 
		c.name AS category
	FROM posts p
		JOIN users u ON p.owner_uid = u.uid
		LEFT JOIN categories c ON p.category_uid = c.uid
	WHERE
		p.type = 1
		AND (p.category_uid = category_constraint OR category_constraint IS NULL)
		AND (p.owner_uid = user_constraint OR user_constraint IS NULL)
		AND ((min_answers IS NOT NULL AND p.answer_count >= min_answers) OR (min_answers IS NULL AND p.answer_count = 0))
	ORDER BY p.uid DESC
	LIMIT start_index, num_results;
END;
//;

-- count the full number of found results for a search made with just constraints (args same as noquery())
CREATE PROCEDURE noquery_count(IN category_constraint INT, IN user_constraint INT, IN min_answers INT, IN max_results INT)
BEGIN
	SELECT COUNT(*) AS count FROM (
		SELECT * FROM posts WHERE 
			type = 1
			AND (category_uid = category_constraint OR category_constraint IS NULL)
			AND (owner_uid = user_constraint OR user_constraint IS NULL)
			AND ((min_answers IS NOT NULL AND answer_count >= min_answers) OR (min_answers IS NULL AND answer_count = 0))
		LIMIT max_results
	) AS results;
END;
//;

DELIMITER ;