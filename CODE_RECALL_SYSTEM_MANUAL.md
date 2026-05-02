# Code Recall System Manual

## 1. Purpose

Code Recall is a gamified learning platform built to support Computer System Servicing learners through:

- guided subject paths
- modules and quizzes
- XP and level progression
- badges and certificates
- wrong-answer review
- memory-retention flashcards
- learner support messaging
- admin and super admin analytics

This manual explains how to use the system as a learner, admin, or super admin.

## 2. User Roles

### Guest

- Can explore the system without a permanent account.
- Progress is stored only on the current device unless the guest registers.
- Logging out clears the guest session.

### Learner / User

- Can take pre-tests, modules, quiz levels, post-tests, review items, and flashcards.
- Can earn XP, badges, and certificates.
- Can use the Contact Us page to send messages to admins.

### Admin

- Can access learner analytics.
- Can view contact inbox messages and reply.
- Can review learner performance, retention load, weak topics, and progress.

### Super Admin

- Has all admin capabilities.
- Has broader oversight for users, learner trends, retention metrics, and contact workflow visibility.

## 3. Main Learning Flow

Each subject follows the same learning path:

1. Pre-Test
2. Modules
3. Quiz Levels
4. Post-Test
5. Certificate Unlock

The system currently supports:

- Computer Hardware
- Electrical Wiring and Electronics Circuit Components

## 4. Learner Guide

### 4.1 Dashboard

The dashboard is the main learner home page. It shows:

- XP
- level
- overall progress
- subject shortcuts
- review tools
- memory review cards due
- latest learning activity
- subject progress summaries

### 4.2 Subjects

Each subject page shows:

- assessment progress
- pre-test status
- quiz-track performance
- post-test performance
- certificate readiness

### 4.3 Pre-Test

Purpose:

- measures learner knowledge before the study flow

Important behavior:

- pre-test is not meant for repeated farming
- XP is awarded only for first-correct question outcomes
- pre-test wrong answers may still appear in review records, but locked items are not always re-answerable in the same way as quiz-level items

### 4.4 Modules

Modules contain:

- guided lesson content
- image-based learning where applicable
- quick checks
- flow checkpoints

Module polish already included:

- progress rail
- current section highlighting
- quick check states
- next-step guidance

### 4.5 Quiz Levels

Quiz levels are short grouped assessments inside a subject difficulty path.

Important behavior:

- a learner has 3 tries per question for the day where that rule applies
- after the final failed try, the learner is told to answer again the next day
- XP is awarded only on the first time a question becomes correct
- if a learner answered a question wrong before and later fixes it, XP is granted when it becomes correct
- if a learner already answered that question correctly before, replaying it does not add more XP

### 4.6 Post-Test

Purpose:

- checks understanding after the learning flow is completed

Important behavior:

- contributes to subject completion
- contributes to certificate unlock
- uses the same anti-XP-farming principle as the quiz flow

### 4.7 Wrong-Answer Review

Wrong-answer review is for revisiting previously missed items.

Learners can:

- view missed questions
- reopen the original source activity
- review answer rationale

This supports correction of weak areas without repeating the full subject blindly.

### 4.8 Memory Flashcards

Memory flashcards are the retention system.

A flashcard can be created when:

- the learner answers incorrectly
- the learner answers correctly but selects low confidence:
  - `Somewhat Sure`
  - `Guessing`

Flashcard review buttons:

- `Need Again`
- `Hard Recall`
- `Easy Recall`
- `Open Source`

Behavior:

- `Need Again` keeps the memory weak point in active review
- `Hard Recall` advances by one retention stage
- `Easy Recall` advances faster by skipping ahead more strongly
- `Open Source` reopens the original learning activity

### 4.9 Recovery Feedback

When a learner corrects previously missed questions in a retake, the result modal can show:

- `Recovery win: you fixed X previously missed questions`

This helps learners see that correcting past mistakes matters.

## 5. XP, Levels, and Anti-Farming Rules

### XP Rules

The system no longer allows simple XP farming from repeating already-correct answers.

Current principle:

- XP is awarded only on first-correct question resolution

Meaning:

- first correct answer = XP awarded
- wrong first, correct later = XP awarded when corrected
- already-correct before, correct again later = no additional XP

This applies to:

- quiz levels
- main quiz flows
- pre-test and post-test logic where first-correct tracking is already integrated

### Levels

- XP contributes to level progress
- progress bars in the dashboard and settings reflect XP movement

## 6. Certificates

Certificates unlock after full subject completion.

Current certificate support includes:

- Computer Hardware Certificate
- Electrical Wiring Certificate
- Dual Subject Completion Certificate

### Certificate Vault

The certificate page includes:

- search
- subject filter
- locked/unlocked filter
- sort options
- issued history

### Certificate Actions

Learners can:

- view certificate
- download certificate
- print or save as PDF through the browser flow

## 7. Contact Us

The Contact Us page allows learners to send:

- concerns
- feedback
- comments
- learning-related questions

### Learner side

Learners can:

- send a message
- view their own private conversation history
- read admin replies

### Admin / Super Admin side

Admins can:

- see the contact inbox
- open learner messages
- reply directly
- review message states

The conversation history is private per learner and is not intended to expose one learner’s messages to another learner.

## 8. Admin Guide

Admins can use the admin dashboard to monitor learners.

### Available learner analytics

- average pre-test score
- average post-test score
- hardware completion
- electrical completion
- most-missed topics
- subject completion breakdown
- learner profile modal
- weak topics
- recent activity history
- assessment performance bars
- retention snapshot
- due memory queue

### Retention analytics

Admins can now also view:

- due memory cards
- learners with due cards
- low-confidence cards
- retention recoveries
- highest due flashcard load
- lowest retention recovery

## 9. Super Admin Guide

Super admins have broader system visibility.

They can:

- access all admin reporting areas
- monitor wider learner performance
- review retention oversight metrics
- access contact workflow oversight

## 10. Memory Review Schedule Controls

The Settings page now includes a `Memory Review Schedule` section.

This controls:

- whether the first weak-memory flashcard appears immediately
- the later review intervals for retention stages

Default schedule:

- immediate first review enabled
- 1 day
- 3 days
- 7 days
- 14 days

This setting is useful when:

- review feels too heavy
- learners need more frequent repetition
- instructors want to tune retention timing on the current device

## 11. Settings Page

The Settings page currently supports:

- account info
- profile editing
- photo upload / reset
- theme toggle
- sound effects toggle
- background music toggle
- auto-advance toggle
- progress overview
- retention schedule controls
- reset actions

Reset actions include:

- reset hardware modules
- reset hardware subject
- reset electrical subject
- reset all progress
- clear local data

## 12. Guest Account Notes

Guest mode is useful for testing and exploration, but it is limited.

Important reminders:

- guest progress is device-based
- logging out ends the session
- learners should register if they want permanent saved progress

## 13. Troubleshooting

### Flashcards appear too often

Check:

- whether answers are being marked wrong
- whether confidence is set to `Somewhat Sure` or `Guessing`
- whether retention intervals are very short in Settings

### XP does not increase after replaying a quiz

This is expected when:

- the learner already answered those same questions correctly before

The system now prevents XP farming.

### Certificate not unlocked

Check whether all subject steps are finished:

- pre-test
- modules
- quiz track
- post-test

### Contact message cannot send

Check:

- Firestore rules are deployed
- the user is properly signed in
- the project is using the correct Firebase configuration

### Flashcard image not showing

Check:

- whether the retention item was created after image support was added
- whether the source question actually contains an image field

## 14. Recommended Admin Monitoring Routine

A simple admin routine can be:

1. Check contact inbox
2. Check due memory cards
3. Check learners with high retention load
4. Check low retention recovery learners
5. Review most-missed topics
6. Monitor subject completion rates

## 15. Suggested Next Enhancements

Good future improvements may include:

- exportable admin reports
- learner retention trend graphs
- per-topic retention heatmaps
- downloadable manual PDF version
- onboarding guide for first-time learners
- full technical administrator deployment guide

## 16. File Reference Notes

This system is primarily driven by:

- `dashboard.html`
- `subject.html`
- `quiz.html`
- `quiz-level.html`
- `review.html`
- `contact.html`
- `certificates.html`
- `admin.html`
- `super-admin.html`
- `settings.html`

Core scripts include:

- `scripts/quiz.js`
- `scripts/quiz-level.js`
- `scripts/review.js`
- `scripts/retention-store.js`
- `scripts/contact.js`
- `scripts/certificates.js`
- `scripts/admin.js`
- `scripts/super-admin.js`
- `scripts/settings.js`

## 17. Closing Note

Code Recall is designed not only to check whether learners finish tasks, but also to help them remember what they learned over time. The system now combines:

- guided study
- assessment
- correction
- recovery tracking
- spaced memory review

That makes it more than a quiz platform. It becomes a full learning-and-retention support system.
