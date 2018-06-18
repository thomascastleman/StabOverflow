
USE staboverflow;

INSERT INTO users (email, full_name, is_admin) VALUES
	("user1@gmail.com", "User One", 0),
	("user2@gmail.com", "User Two", 0),
	("user3@gmail.com", "User Three", 1),
	("user4@gmail.com", "User Four", 0),
	("user5@gmail.com", "User Five", 0);

INSERT INTO categories (name) VALUES ("CSP"), ("HDS"), ("HSE");

INSERT INTO posts (parent_question_uid, type_uid, category_uid, owner_uid, owner_name, creation_date, title, body) VALUES
	-- a question and two answers
	(NULL, 1, 2, 2, "User Two", NOW(), "How do I ask a test question?", "This is a test question for testing purposes"),
	(1, 2, NULL, 3, "User Three", NOW(), NULL, "Here is the answer to your question."),
	(1, 2, NULL, 4, "User Four", NOW(), NULL, "I also have an answer to question 1."),

	(NULL, 1, 1, 5, "User Five", NOW(), "How do I ask a second question?", "I am having trouble asking a question."),
	(4, 2, NULL, 1, "User One", NOW(), NULL, "This is how you answer your question"),
	(4, 2, NULL, 3, "User Three", NOW(), NULL, "This is user 3 answering your question."),
	(4, 2, NULL, 4, "User Four", NOW(), NULL, "Here's a third answer to your question.");

INSERT INTO tags (tag, post_uid) VALUES
	("test-question", 1),
	("new-post", 1),
	("testing", 1);

INSERT INTO comments (parent_uid, parent_question_uid, owner_uid, owner_name, creation_date, body) VALUES
	(2, 1, 2, "User Two", NOW(), "I think this is an interesting answer to the question"),
	(2, 1, 1, "User One", NOW(), "I also thought the answer was interesting"),
	(1, 1, 3, "User Three", NOW(), "Could you clarify the question?"),
	(6, 4, 5, "User Five", NOW(), "Thanks for the helpful answer.");