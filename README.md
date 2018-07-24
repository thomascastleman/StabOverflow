# StabOverflow
Online Q&A community for the St. Anne's-Belfield CS Department.

**Created by Thomas Castleman and Johnny Lindbergh.**
![StabOverflow Logo](http://tcastleman.com/overflow.png)

## Introduction

StabOverflow was created as a platform for the exchange of knowledge within the CS department. The objective was to give students more of an opportunity for their questions to be heard and answered not only by faculty but also by their peers.

## Features

The current functionality of StabOverflow includes:
- [markdown editors](https://code.google.com/archive/p/pagedown/wikis/PageDown.wiki) for questions and answers (clean formatting, [syntax highlighting](https://github.com/google/code-prettify) with code)
- classification of questions based on adminstrator-determined categories
- an upvoting system to move the best answers to the top
- a fully-featured search engine with options to narrow results based on category, user, and number of answers
- user profiles
- authentication system to limit certain functionality to students only

## Authentication

Our authentication system uses [OAuth 2.0](https://oauth.net/2/) with Google (through [passport](https://www.npmjs.com/package/passport)) to securely verify the identity of users without requiring them to keep track of another password.

After authenticating, new users' emails are checked to confirm that they are of the `stab.org` or `students.stab.org` domain, and are entered into the system if so.

Only users who hold accounts in the system may participate in the posting of questions, answers, and comments. However, unauthenticated users are still able to view site content and make use of the search features.

## Identity Integrity

While users are allowed certain degrees of freedom in customizing their display name and optionally writing a profile description, their full name according to Google is kept on record and available, in most cases, by simply hovering over their display name. Their email is also available to administrators. 

This immutable link is designed to prevent the potential troubles of anonymity as well as identity theft.

## Administrator Tools

Special administrator accounts have access to a host of features unavailable to regular users, including:
- manually adding new user accounts
- granting administrator privileges
- revoking administrator privileges
- creating, archiving, and deleting question categories
- deleting questions, answers, comments

Using these tools, administrators are able to manage and monitor the site even as time progresses and the curriculum and faculty change.
