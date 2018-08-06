
SOURCE create_db.sql;

INSERT INTO users (email, real_name, display_name, is_admin) VALUES
	("user1@gmail.com", "One's Real Name", "User One", 0),
	("user2@gmail.com", "Two's Real Name", "User Two", 0),
	("user3@gmail.com", "Three's Real Name", "User Three", 1),
	("user4@gmail.com", "Four's Real Name", "User Four", 0),
	("user5@gmail.com", "Five's Real Name", "User Five", 0);

UPDATE users SET image_url = "https://lh5.googleusercontent.com/-39Ro4gCIPRU/AAAAAAAAAAI/AAAAAAAAAAA/AAnnY7rq8oKrGNsJef9tJpeMK6l8CqW8dA/mo/photo.jpg";

INSERT INTO categories (name) VALUES
	("Computer Science Principles"), 
	("Honors Data Structures"), 
	("Honors Software Engineering");

INSERT INTO posts (parent_question_uid, type, category_uid, owner_uid, creation_date, title, body, upvotes, answer_count) VALUES
	-- a question and two answers
	(1, 1, 2, 2, NOW(), "This is a test question?", "This is a test question for testing peanuts. The topic here is clearly peanuts.", 15, 2),
	(1, 0, NULL, 3, NOW(), NULL, "Here is the peanuts to your question And also peanuts thanks.", 0, NULL),
	(1, 0, NULL, 4, NOW(), NULL, "Peanuts, this has peanuts, all of the peanuts.", 2, NULL),

	(4, 1, 1, 5, NOW(), "How do I ask a question?", "I am having trouble asking a question.", 6, 3),
	(4, 0, NULL, 1, NOW(), NULL, "This is how you answer your question", 10, NULL),
	(4, 0, NULL, 3, NOW(), NULL, "This is user 3 answering your question.", 0, NULL),
	(4, 0, NULL, 4, NOW(), NULL, "authenticate, authentic, authentication and some other words", 0, NULL),

	(8, 1, NULL, 1, NOW(), "I have a question about a thing?", "Here's another question. And I have this word: authenticity", 3, 0);

INSERT INTO comments (parent_uid, parent_question_uid, owner_uid, creation_date, body) VALUES
	(2, 1, 2, NOW(), "I think this is an interesting answer to the question"),
	(2, 1, 1, NOW(), "I also thought the answer was interesting"),
	(1, 1, 3, NOW(), "Could you clarify the question?"),
	(6, 4, 5, NOW(), "Thanks for the helpful answer.");

INSERT INTO upvotes (post_uid, user_uid) VALUES
	(1, 3),
	(1, 4),
	(3, 5);

-- INSERT INTO stems (stem) VALUES
-- 	("word"),
-- 	("anoth"),
-- 	("test"),
-- 	("this"),
-- 	("interest"),
-- 	("queri");

-- INSERT INTO scores (stem_uid, post_uid, score) VALUES
-- 	(1, 2, 300),
-- 	(2, 3, 120),
-- 	(3, 2, 220),
-- 	(3, 1, 10),
-- 	(4, 2, 100),
-- 	(5, 4, 360),
-- 	(5, 5, 100),
-- 	(2, 8, 90),
-- 	(1, 4, 100);