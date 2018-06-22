
DROP DATABASE IF EXISTS staboverflow;
CREATE DATABASE staboverflow;

USE staboverflow;

-- all user accounts
CREATE TABLE users (
	uid INT NOT NULL AUTO_INCREMENT,
	email VARCHAR(32),
	full_name VARCHAR(32),
	bio VARCHAR(140),
	is_admin TINYINT(1),
	PRIMARY KEY (uid)
);

-- admin-defined categories under which to post
CREATE TABLE categories (
	uid INT NOT NULL AUTO_INCREMENT,
	name VARCHAR(16),
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
	creation_date DATETIME,
	answer_count INT,
	upvotes INT,
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
	creation_date DATETIME,
	body TEXT,
	PRIMARY KEY (uid),
	FOREIGN KEY (parent_uid) REFERENCES posts(uid),
	FOREIGN KEY (parent_question_uid) REFERENCES posts(uid),
	FOREIGN KEY (owner_uid) REFERENCES users(uid)
);

-- user-defined question tags
CREATE TABLE tags (
	uid INT NOT NULL AUTO_INCREMENT,
	tag VARCHAR(16),
	post_uid INT,
	PRIMARY KEY (uid),
	FOREIGN KEY (post_uid) REFERENCES posts(uid)
);