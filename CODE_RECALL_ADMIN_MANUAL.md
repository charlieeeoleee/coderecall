# Code Recall Admin Manual

## Document Purpose

This manual is for admins such as:

- teachers
- facilitators
- school staff assigned to monitor learners

It explains how to use the admin side of Code Recall to monitor progress, review support messages, and identify learners who need intervention.

---

## 1. Admin Role Overview

Admins are responsible for:

- monitoring learner progress
- reading concerns and feedback
- replying to user messages
- checking weak areas and retention load

Admins do not only monitor scores. They also monitor whether learners are remembering content over time.

## 2. Admin Dashboard

The admin dashboard provides summary visibility into learner performance.

It can include:

- average pre-test score
- average post-test score
- completion rates per subject
- most-missed topics
- learner tables
- retention indicators

**Suggested image to insert here**
- Screenshot of the admin dashboard

## 3. Learner Analytics

Admins can inspect individual learners and view:

- activity history
- weak topics
- subject status
- assessment performance bars
- retention snapshot
- due memory queue

This makes it easier to identify:

- learners who are progressing
- learners who are struggling
- learners who need intervention

**Suggested image to insert here**
- Screenshot of learner profile modal in admin page

## 4. Assessment Performance

Inside learner analytics, admins can review subject performance through:

- pre-test score
- quiz-track score
- post-test score
- XP earned from first-correct answers

This helps admins compare readiness, practice performance, and final mastery.

## 5. Retention Analytics

Admins can track retention-related indicators such as:

- due memory cards
- learners with due cards
- low-confidence cards
- retention recoveries
- highest due flashcard load
- lowest retention recovery

These metrics help determine whether learners are retaining knowledge and using review tools properly.

## 6. Weak Topics and Recovery

The system can highlight:

- most-missed topics
- learners repeatedly struggling on the same concepts
- learners who are improving through recovery feedback

Admins should pay close attention to learners who:

- accumulate many due flashcards
- continue missing the same topic
- finish content without strong recovery over time

## 7. Contact Inbox

Admins can review learner messages in the contact area.

They can:

- view learner concerns
- read learner conversation threads
- reply to messages
- monitor support requests related to learning and system issues

**Suggested image to insert here**
- Screenshot of admin contact inbox

## 8. Privacy Expectations

Learner conversation history is intended to remain private per learner.

Admins can access submitted learner messages only through the authorized admin contact view. Regular learners should not see other learners' message histories.

## 9. Suggested Admin Routine

A suggested daily or weekly admin routine may be:

1. Review Contact Us inbox
2. Check most-missed topics
3. Check completion rates
4. Review due memory-card load
5. Open learner profiles with weak progress
6. Reply to learner concerns

## 10. Troubleshooting for Admins

### A learner says they earned no XP

Check whether:

- the learner already answered those questions correctly before
- the XP anti-farming rule is doing its job

### A learner says flashcards appear too often

Check:

- confidence answers used
- frequency of wrong answers
- retention schedule settings

### A learner cannot send contact messages

Check:

- Firestore rules
- authenticated status
- role-based page access

### Dashboard numbers look strange

Check:

- whether learner data is synced
- whether recent results were saved
- whether the learner is in guest mode or registered mode

