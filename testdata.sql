
SOURCE create_db.sql;

INSERT INTO users (email, full_name, is_admin) VALUES
	("user1@gmail.com", "User One", 0),
	("user2@gmail.com", "User Two", 0),
	("user3@gmail.com", "User Three", 1),
	("user4@gmail.com", "User Four", 0),
	("user5@gmail.com", "User Five", 0);

INSERT INTO categories (name) VALUES ("CSP"), ("HDS"), ("HSE");

INSERT INTO posts (parent_question_uid, type, category_uid, owner_uid, owner_name, creation_date, title, body, upvotes, answer_count) VALUES
	-- a question and two answers
	(NULL, 1, 2, 2, "User Two", NOW(), "How do I ask a test question?", "This is a test question for testing purposes", 15, 2),
	(1, 0, NULL, 3, "User Three", NOW(), NULL, "Here is the answer to your question.", 0, NULL),
	(1, 0, NULL, 4, "User Four", NOW(), NULL, "I also have an answer to question 1.", 2, NULL),

	(NULL, 1, 1, 5, "User Five", NOW(), "How do I ask a second question?", "I am having trouble asking a question.", 6, 3),
	(4, 0, NULL, 1, "User One", NOW(), NULL, "This is how you answer your question", 10, NULL),
	(4, 0, NULL, 3, "User Three", NOW(), NULL, "This is user 3 answering your question.", 0, NULL),
	(4, 0, NULL, 4, "User Four", NOW(), NULL, "Here's a third answer to your question.", 0, NULL),

	(NULL, 1, NULL, 1, "User One", NOW(), "Question?", "Here's another question.", 3, 0);

INSERT INTO comments (parent_uid, parent_question_uid, owner_uid, owner_name, creation_date, body) VALUES
	(2, 1, 2, "User Two", NOW(), "I think this is an interesting answer to the question"),
	(2, 1, 1, "User One", NOW(), "I also thought the answer was interesting"),
	(1, 1, 3, "User Three", NOW(), "Could you clarify the question?"),
	(6, 4, 5, "User Five", NOW(), "Thanks for the helpful answer.");

INSERT INTO upvotes (post_uid, user_uid) VALUES
	(1, 3),
	(1, 4),
	(3, 5);

INSERT INTO stems (stem) VALUES
	("word"),
	("another"),
	("test"),
	("this"),
	("interesting"),
	("query");

INSERT INTO scores (stem_uid, post_uid, score) VALUES
	(1, 2, 300),
	(2, 3, 120),
	(3, 2, 220),
	(3, 1, 10),
	(4, 2, 100);