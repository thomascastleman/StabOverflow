
DROP DATABASE IF EXISTS staboverflow;
CREATE DATABASE staboverflow;

USE staboverflow;

-- all user accounts
CREATE TABLE users (
	uid INT NOT NULL AUTO_INCREMENT,
	email VARCHAR(32),
	full_name VARCHAR(32),
	bio VARCHAR(140),
	is_admin TINYINT(1) DEFAULT 0,
	PRIMARY KEY (uid)
);

-- admin-defined categories under which to post
CREATE TABLE categories (
	uid INT NOT NULL AUTO_INCREMENT,
	name VARCHAR(16),
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

-- add new user and get their information
DELIMITER @@;
CREATE PROCEDURE create_user (IN user_email VARCHAR(32), IN user_name VARCHAR(32))
BEGIN
	INSERT INTO users (email, full_name) VALUES (user_email, user_name);
	SELECT * FROM users WHERE uid = LAST_INSERT_ID();
END;
@@;
DELIMITER ;

-- create new question and get its uid
DELIMITER @@;
CREATE PROCEDURE create_question (IN category_uid INT, IN owner_uid INT, IN owner_name VARCHAR(32), IN title TEXT, IN body TEXT)
BEGIN
	INSERT INTO posts (type, category_uid, owner_uid, owner_name, title, body) VALUES (1, category_uid, owner_uid, owner_name, title, body);
	SELECT LAST_INSERT_ID() AS redirect_uid;
END;
@@;
DELIMITER ;