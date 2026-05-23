# Code Recall Comprehensive System Manual

## Document Overview

This manual presents the complete structure, purpose, workflow, and operation of the Code Recall system. It is written as a thesis-style system manual that may be used as an appendix, implementation reference, or supporting documentation for the study.

Code Recall is a web-based gamified learning and assessment system designed to support learners in reviewing Computer System Servicing-related concepts. The system combines instructional modules, pre-tests, quiz levels, post-tests, progress tracking, XP rewards, achievements, certificates, review tools, and administrative analytics.

## 1. System Purpose

The main purpose of Code Recall is to provide a structured digital learning environment where learners can study selected subject areas, answer assessments, receive feedback, and monitor their learning progress. The system is intended to help learners improve retention through repeated practice, wrong-answer review, confidence-based answering, and memory-review features.

For administrators and researchers, the system provides monitoring tools for viewing learner progress, assessment scores, module completion, quiz performance, post-test results, and overall engagement.

## 2. System Development Structure

The system was developed as a multi-page web application using the following technologies:

- HTML for page structure and content layout
- CSS for design, styling, spacing, responsiveness, and visual presentation
- JavaScript for interactivity, assessment logic, role handling, analytics, and Firebase communication
- Firebase Authentication for login, account management, and user identity
- Cloud Firestore for storing user records, progress, assessment results, XP, roles, messages, and analytics data
- Firebase Hosting for web deployment
- Firebase Security Rules for controlling database access
- Firebase Functions for backend support where applicable
- PostgreSQL backup support for preserving Firestore records for reporting or external analysis

The system does not currently use a large front-end framework such as React, Vue, Angular, or Next.js. Instead, it uses a modular page-based structure where each HTML page is paired with its own JavaScript and CSS files.

## 3. Major System Components

### 3.1 Authentication Module

The authentication module manages user login, registration, session handling, and role-based redirection. It uses Firebase Authentication to verify user identity.

This module includes:

- login
- registration
- logout
- authenticated session checking
- role-based navigation
- privileged access validation
- multi-factor authentication support for admin and super admin accounts

### 3.2 Learner Module

The learner module provides the main learning experience. Learners can access subjects, take pre-tests, read modules, answer quiz levels, complete post-tests, view progress, earn XP, unlock achievements, and receive certificates.

The learner module includes:

- dashboard
- subject selection
- subject progress page
- pre-test
- module lessons
- quiz difficulty and level selection
- post-test
- review page
- achievements page
- certificate page
- settings page
- contact/support page

### 3.3 Assessment Module

The assessment module handles pre-tests, quiz levels, and post-tests.

The pre-test measures the learner's baseline knowledge before studying the modules. Quiz levels reinforce the lesson content through smaller assessment stages. The post-test measures the learner's understanding after completing the learning path.

Assessment records may include:

- score
- total items
- percentage
- XP earned
- completion status
- timestamp
- subject
- difficulty
- quiz level

### 3.4 Gamification Module

The gamification module is used to increase learner engagement. It includes XP, progress indicators, achievements, levels, and certificates.

The gamification features include:

- XP points
- weekly XP
- level progress
- badges
- leaderboard
- subject completion
- certificate unlock

The system applies anti-farming logic by awarding XP mainly through first-correct completion. This helps prevent learners from repeatedly answering the same activity only to gain XP.

### 3.5 Review and Retention Module

The review module stores and displays learning items that require further attention. A learner may receive review items after answering incorrectly or after selecting a low-confidence response.

The review and retention features include:

- wrong-answer review
- memory flashcards
- confidence-based review
- due review indicators
- recovery tracking
- source activity reopening

This module supports long-term learning by encouraging learners to revisit weak topics instead of simply moving forward after completing a quiz.

### 3.6 Admin Module

The admin module allows authorized administrators to monitor learner performance and system activity.

Admin functions include:

- viewing total learners
- viewing average XP
- viewing module completion
- viewing average pre-test and post-test scores
- reviewing subject completion
- checking learner progress
- opening individual learner profiles
- monitoring weak topics
- viewing contact messages
- reviewing content drafts

### 3.7 Super Admin Module

The super admin module provides higher-level system control and monitoring.

Super admin functions include:

- user oversight
- role monitoring
- privileged access control
- system health review
- security profile monitoring
- two-factor authentication oversight
- audit log viewing
- contact workflow monitoring
- publishing and content review support

## 4. User Roles and Permissions

### 4.1 Guest User

A guest user may explore parts of the system without a permanent account. Guest progress may be stored locally on the current device only.

### 4.2 Learner

A learner is a registered user who can complete the learning path and save progress to Firestore.

Learners can:

- access the dashboard
- open subjects
- take pre-tests
- read modules
- answer quizzes
- take post-tests
- earn XP
- unlock achievements
- view certificates
- submit contact messages

### 4.3 Admin

An admin can view learner analytics and monitor learner progress.

Admins can:

- access the admin dashboard
- view learner scores
- view completion rates
- monitor weak areas
- check support messages
- review learner activity

### 4.4 Super Admin

A super admin has the highest level of access.

Super admins can:

- access super admin dashboard
- review all users
- manage privileged access
- monitor security and MFA status
- view audit records
- supervise system-wide analytics

## 5. Main Learner Workflow

The learner workflow follows a structured sequence:

1. The learner logs in through the authentication page.
2. The learner is redirected to the dashboard.
3. The learner selects a subject.
4. The learner takes the pre-test.
5. The learner studies the learning modules.
6. The learner answers quiz levels.
7. The learner completes the post-test.
8. The learner unlocks progress, achievements, and certificates.
9. The learner may revisit wrong answers or memory-review items.

This flow was designed to support both assessment and learning reinforcement.

## 6. Subject Learning Flow

Each subject follows the same general structure:

1. Pre-Test
2. Modules
3. Quiz Track
4. Post-Test
5. Certificate

The supported subjects include:

- Computer Hardware
- Electrical Wiring and Electronics Circuit Components

## 7. Assessment Flow

### 7.1 Pre-Test

The pre-test is used to measure the learner's initial knowledge before studying the subject content. It provides a baseline score for comparison with the post-test.

### 7.2 Modules

Modules provide the instructional content. They may contain text explanations, images, examples, quick checks, and progress indicators.

### 7.3 Quiz Track

The quiz track is divided into difficulty levels and smaller quiz levels. It reinforces learning through repeated practice and scoring.

### 7.4 Post-Test

The post-test is used to measure the learner's understanding after completing the learning flow. It contributes to completion tracking and certificate readiness.

## 8. Admin Workflow

The admin workflow focuses on monitoring and support.

1. The admin logs in.
2. The system verifies the admin role.
3. The admin accesses the admin dashboard.
4. The admin reviews learner progress and assessment averages.
5. The admin opens learner profiles for detailed review.
6. The admin checks weak topics, retention indicators, and contact messages.
7. The admin may respond to learner support concerns.

The admin dashboard supports educational monitoring by displaying both score-based and progress-based indicators.

## 9. Super Admin Workflow

The super admin workflow focuses on system management and security oversight.

1. The super admin logs in.
2. The system verifies privileged access.
3. The super admin opens the super admin dashboard.
4. The super admin reviews user records, roles, system health, and security indicators.
5. The super admin may manage access and review audit activity.
6. The super admin may inspect system-wide learner analytics.

## 10. Data Storage Structure

The main database used by the system is Cloud Firestore.

Important Firestore collections include:

- `users`
- `leaderboard_public`
- `accessRoles`
- `securityProfiles`
- `pendingUsers`
- `contactMessages`
- `feedbackNotes`
- `auditLogs`

The `users` collection is the most important collection for learner progress. It may contain:

- name
- email
- role
- XP
- progress flags
- assessment results
- study history
- wrong-answer review records
- retention queue items
- certificate readiness data

## 11. File Structure Summary

The system is organized by file type and feature.

### 11.1 HTML Pages

HTML files provide the visible structure of the pages.

Examples:

- `index.html`
- `auth.html`
- `dashboard.html`
- `subjects.html`
- `subject.html`
- `module.html`
- `quiz.html`
- `quiz-level.html`
- `review.html`
- `admin.html`
- `super-admin.html`
- `certificate.html`
- `settings.html`

### 11.2 CSS Files

CSS files control page appearance, layout, colors, spacing, responsiveness, and visual consistency.

Examples:

- `styles/auth.css`
- `styles/dashboard.css`
- `styles/subject.css`
- `styles/module.css`
- `styles/quiz.css`
- `styles/admin.css`
- `styles/settings.css`

### 11.3 JavaScript Files

JavaScript files control system behavior, Firebase communication, user interaction, quiz logic, scoring, analytics, and role handling.

Examples:

- `scripts/auth.js`
- `scripts/dashboard.js`
- `scripts/subject.js`
- `scripts/module.js`
- `scripts/quiz.js`
- `scripts/quiz-level.js`
- `scripts/admin.js`
- `scripts/super-admin.js`
- `scripts/role-utils.js`
- `scripts/firebase-config.js`

### 11.4 Data Files

Data files store quiz items, module content, assessment content, and configuration values.

Examples:

- `data/module-data.js`
- `data/quiz-data.js`
- `data/hardware-assessment-data.js`
- `data/hardware-posttest-data.js`
- `data/electrical-posttest-data.js`
- `data/admin-config.js`

### 11.5 Firebase and Deployment Files

These files support hosting, database rules, deployment, and backend configuration.

Examples:

- `firebase.json`
- `firestore.rules`
- `service-worker.js`
- `functions/index.js`
- `package.json`

## 12. Development Methodology

The system was developed using an iterative methodology. This means that the system was built and improved through repeated cycles of development, testing, review, and refinement.

The iterative approach was suitable because the system required continuous improvements in:

- learning flow
- assessment logic
- role-based access
- dashboard analytics
- Firebase integration
- progress tracking
- user interface design
- security behavior

Instead of building the entire system in one step, the researchers gradually developed the core features first, then added additional functions such as admin analytics, retention review, certificates, role management, and security features.

## 13. Iterative Development Phases

### Phase 1: Core Interface and Navigation

The first phase focused on creating the main pages, navigation, login structure, and initial dashboard.

### Phase 2: Learner Flow

The second phase added subjects, modules, quizzes, pre-tests, and post-tests.

### Phase 3: Progress and Gamification

The third phase added XP, progress tracking, badges, achievements, leaderboard features, and certificates.

### Phase 4: Review and Retention

The fourth phase added wrong-answer review, memory flashcards, confidence tracking, and recovery feedback.

### Phase 5: Admin and Super Admin Features

The fifth phase added role-based dashboards, learner analytics, user monitoring, contact inbox, role oversight, and security monitoring.

### Phase 6: Testing and Refinement

The final phase focused on checking navigation, Firebase behavior, page responsiveness, admin analytics, Firestore rules, and final interface polish.

## 14. Strengths of the System

One strength of the system is that it provides a complete learning flow rather than only a quiz page. It supports pre-assessment, learning content, practice quizzes, post-assessment, review, and certificates.

Another strength is its role-based structure. Learners, admins, and super admins have different access levels, making the system more organized and suitable for school or research use.

The system also has strong monitoring potential because administrators can review learner progress, assessment performance, and weak topics.

The gamified features such as XP, progress bars, achievements, and certificates may also increase learner motivation and engagement.

## 15. Weaknesses of the System

One weakness of the system is that data completeness depends on learner participation. If learners do not complete quizzes or post-tests, the available research data may become incomplete.

Another weakness is that the system still requires broader testing with more respondents and a longer implementation period to fully evaluate learning effectiveness.

The system may also need a more flexible content-management interface so that future administrators can add or update lessons and quiz questions without editing source files.

Finally, the system depends on internet connectivity and Firebase services. If the connection is unstable, access to authentication and live database records may be affected.

## 16. Maintenance and Future Enhancements

Future researchers and developers may improve the system by adding:

- QR-based login
- CSV and PDF export of analytics
- additional subjects
- content-management tools
- automated post-test reminders
- stronger mobile optimization
- more charts and statistical summaries
- improved offline support
- richer certificate customization
- expanded respondent testing

## 17. Recommended Use for Future Researchers

Future researchers may use this system as a foundation for gamified learning, digital assessment, and learner progress monitoring. It is recommended that future implementations require learners to complete the full assessment flow, especially the post-test, to improve the completeness of the research data.

Future researchers may also expand the subject coverage and conduct longer testing periods to better evaluate whether the system improves learning outcomes.

## 18. Summary

Code Recall is a modular web-based learning and assessment system developed using HTML, CSS, JavaScript, Firebase Authentication, and Cloud Firestore. It supports learners through structured subject paths, gamified assessment, review tools, and certificates. It also supports administrators through analytics, learner monitoring, role-based access, and system oversight.

The system was developed through an iterative process, allowing features to be built, tested, and refined progressively. Its main strengths are its complete learning flow, gamified design, role-based access, and analytics capability. Its main limitations are incomplete learner participation, dependency on online services, and the need for broader validation and content-management improvements.
