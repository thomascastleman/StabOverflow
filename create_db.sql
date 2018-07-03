
DROP DATABASE IF EXISTS staboverflow;
CREATE DATABASE staboverflow;

USE staboverflow;

-- all user accounts
CREATE TABLE users (
	uid INT NOT NULL AUTO_INCREMENT,
	email VARCHAR(45),
	full_name VARCHAR(32),
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
	type TINYINT(1),	-- currently implicitly "is question" (0 --> answer, 1 --> question)
	category_uid INT,
	owner_uid INT,
	owner_name VARCHAR(32),
	creation_date DATETIME DEFAULT NOW(),
	answer_count INT DEFAULT 0,
	upvotes INT DEFAULT 0,
	title TEXT,
	body TEXT,
	PRIMARY KEY (uid),
	FOREIGN KEY (category_uid) REFERENCES categories(uid),
	FOREIGN KEY (owner_uid) REFERENCES users(uid)
);

-- all comments
CREATE TABLE comments (
	uid INT NOT NULL AUTO_INCREMENT,
	parent_uid INT,
	parent_question_uid INT,
	owner_uid INT,
	owner_name VARCHAR(32),
	creation_date DATETIME DEFAULT NOW(),
	body TEXT,
	PRIMARY KEY (uid),
	FOREIGN KEY (parent_uid) REFERENCES posts(uid) ON DELETE CASCADE,
	FOREIGN KEY (parent_question_uid) REFERENCES posts(uid) ON DELETE CASCADE,
	FOREIGN KEY (owner_uid) REFERENCES users(uid)
);

-- which users have upvoted which posts
CREATE TABLE upvotes (
	uid INT NOT NULL AUTO_INCREMENT,
	post_uid INT,
	user_uid INT,
	PRIMARY KEY (uid),
	FOREIGN KEY (post_uid) REFERENCES posts(uid) ON DELETE CASCADE,
	FOREIGN KEY (user_uid) REFERENCES users(uid)
);

-- word stems from posts
CREATE TABLE stems (
	uid INT NOT NULL AUTO_INCREMENT,
	stem VARCHAR(16) UNIQUE,
	PRIMARY KEY (uid)
);

-- stem scoring with posts
CREATE TABLE scores (
	uid INT NOT NULL AUTO_INCREMENT,
	stem_uid INT,
	post_uid INT,
	score FLOAT,
	PRIMARY KEY (uid),
	FOREIGN KEY (stem_uid) REFERENCES stems(uid),
	FOREIGN KEY (post_uid) REFERENCES posts(uid) ON DELETE CASCADE
);

-- add new user and get their information
DELIMITER //;
CREATE PROCEDURE create_user (IN user_email VARCHAR(45), IN user_name VARCHAR(32))
BEGIN
	INSERT INTO users (email, full_name) VALUES (user_email, user_name);
	SELECT * FROM users WHERE uid = LAST_INSERT_ID();
END;
//;

-- create new question and get its uid
DELIMITER //;
CREATE PROCEDURE create_question (IN category_uid INT, IN owner_uid INT, IN owner_name VARCHAR(32), IN title TEXT, IN body TEXT)
BEGIN
	INSERT INTO posts (type, category_uid, owner_uid, owner_name, title, body) VALUES (1, category_uid, owner_uid, owner_name, title, body);
	SELECT LAST_INSERT_ID() AS redirect_uid;
END;
//;

-- create new answer update answer_count of parent
DELIMITER //;
CREATE PROCEDURE create_answer (IN parent_question_uid INT, IN owner_uid INT, IN owner_name VARCHAR(32), IN body TEXT)
BEGIN
	INSERT INTO posts (type, parent_question_uid, owner_uid, owner_name, body) VALUES (0, parent_question_uid, owner_uid, owner_name, body);
	UPDATE posts SET answer_count = answer_count + 1 WHERE uid = parent_question_uid;
	SELECT LAST_INSERT_ID() AS answer_uid;
END;
//;

-- apply name change
DELIMITER //;
CREATE PROCEDURE name_change (IN user_uid INT, IN user_name VARCHAR(32))
BEGIN
	UPDATE posts SET owner_name = user_name WHERE owner_uid = user_uid;
	UPDATE comments SET owner_name = user_name WHERE owner_uid = user_uid;
END;
//;

-- get posts relevant to query ordered by score
DELIMITER //
CREATE PROCEDURE query(IN q VARCHAR(65535), IN category_filter VARCHAR(65535), IN answer_filter VARCHAR(65535))
BEGIN
    SET @query = CONCAT ("
    	SELECT redirect_uid, SUM(score) AS score, title, owner_uid, owner_name, creation_date, answer_count, upvotes, category FROM (
			SELECT 
					scores.score,
					q.uid AS redirect_uid,
					q.title,
					q.owner_uid,
					q.owner_name,
					DATE_FORMAT(q.creation_date, '%l:%i %p, %b %D, %Y') AS creation_date,
					q.answer_count,
					q.upvotes,
					c.name AS category
			FROM
				stems JOIN scores ON stems.uid = scores.stem_uid
				JOIN posts p ON scores.post_uid = p.uid
				JOIN posts q ON p.parent_question_uid = q.uid OR (p.type = 1 AND p.uid = q.uid) 
				LEFT JOIN categories c ON q.category_uid = c.uid
				WHERE 
					stems.stem IN (", q, ")", category_filter, answer_filter, ") AS results 
		GROUP BY redirect_uid 
		ORDER BY score DESC;");
	PREPARE stmt FROM @query;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
END //


-- search posts without query; only filter by category and/or answered status
DELIMITER //
CREATE PROCEDURE noquery(IN category_filter VARCHAR(65535), IN answer_filter VARCHAR(65535))
BEGIN
	SET @query = CONCAT("SELECT 
			q.uid AS redirect_uid, 
			q.title, 
			q.owner_uid, 
			q.owner_name, 
			DATE_FORMAT(q.creation_date, '%l:%i %p, %b %D, %Y') AS creation_date,
			q.upvotes, 
			q.answer_count, 
			c.name AS category 
		FROM 
			posts q LEFT JOIN categories c ON q.category_uid = c.uid 
			WHERE q.type = 1", category_filter, answer_filter, " ORDER BY q.uid DESC;");
	PREPARE stmt FROM @query;
	EXECUTE stmt;
	DEALLOCATE PREPARE stmt;
END //
DELIMITER ;