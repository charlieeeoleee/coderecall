# Code Recall Admin Manual

## Document Purpose

This manual is for admins such as:

- teachers
- facilitators
- school staff assigned to monitor learners

It explains how to use the admin side of Code Recall to review learner progress, retention, support messages, and protected admin access.

---

## 1. Admin Role Overview

Admins are responsible for:

- monitoring learner progress
- reviewing support and contact messages
- identifying weak learners and weak topics
- tracking memory-retention load
- replying to learner concerns

Admins monitor not only scores, but also whether learners are retaining knowledge over time.

---

## 2. Admin 2FA Access Protection

Admins now use authenticator-based 2FA before they can enter the admin dashboard.

The setup flow includes:

- QR code enrollment
- manual setup key
- `Open in Authenticator`
- backup codes
- verification before admin access

Recovery options:

- use a backup code if the authenticator app is unavailable
- use `Reset My Admin 2FA` from the admin page to re-enroll later if needed

Important practice:

- download or copy backup codes during setup
- keep them offline and private
- use backup codes only for recovery

**Suggested image to insert here**
- `admin-01-admin-mfa-setup.png`

---

## 3. Admin Dashboard

The admin dashboard provides summary visibility into learner performance.

It can include:

- average pre-test score
- average post-test score
- hardware completion
- electrical completion
- most-missed topics
- learner tables
- assessment and retention indicators

**Suggested image to insert here**
- `admin-02-dashboard-overview.png`

---

## 4. Learner Analytics

Admins can inspect individual learners through the learner profile modal.

The modal can show:

- assessment performance
- subject progress status
- weak topics
- recent activity history
- retention snapshot
- due memory queue

This helps identify:

- learners who are progressing well
- learners who are behind
- learners who need intervention on a specific topic

**Suggested image to insert here**
- `admin-03-learner-modal.png`

---

## 5. Assessment Performance

Inside learner analytics, admins can review:

- pre-test score
- quiz-track score
- post-test score
- score bars
- XP earned from first-correct answers

This helps compare:

- starting readiness
- practice performance
- final subject mastery

---

## 6. Retention Analytics

Admins can review retention-related indicators such as:

- due memory cards
- learners with due cards
- low-confidence cards
- retention recoveries
- highest due flashcard load
- lowest retention recovery

These indicators help admins judge whether learners are actually remembering the material over time.

---

## 7. Weak Topics and Recovery

The admin side can highlight:

- most-missed topics
- repeated weak areas
- due memory queue pressure
- recovery improvement from retakes

Admins should pay attention to learners who:

- accumulate many due flashcards
- continue missing the same concepts
- complete activities but show weak recovery later

---

## 8. Contact Inbox

Admins can review learner messages through the contact inbox.

Admins can:

- open learner messages
- read conversation history
- reply directly
- monitor support requests related to learning or system use

Privacy reminder:

- learner threads are intended to stay private between the learner and the authorized admin side

**Suggested image to insert here**
- `admin-04-contact-inbox.png`

---

## 9. Suggested Admin Routine

A useful daily or weekly routine may be:

1. Review Contact Us inbox
2. Check learners with high due-card load
3. Check most-missed topics
4. Review completion rates
5. Open learner analytics for struggling users
6. Reply to urgent learner concerns

---

## 10. Interpreting Common Situations

### A learner says they earned no XP

Check whether:

- the learner already answered those questions correctly before
- the first-correct-only XP rule is preventing XP farming

### A learner says flashcards appear too often

Check:

- repeated wrong answers
- low-confidence correct answers
- whether the learner already had due cards from earlier work
- memory review schedule settings

### A learner says a message cannot be sent

Check:

- authentication state
- Firestore permissions
- whether the learner is properly logged in

### A learner says the dashboard or progress looks wrong

Check:

- whether progress saved successfully
- whether the learner is using guest mode
- whether recent quiz or review data synced correctly

---

## 11. Troubleshooting for Admins

### An admin cannot enter the dashboard

Check:

- whether admin 2FA enrollment was completed
- whether the authenticator app is generating the current 6-digit code
- whether the `Open in Authenticator` option was used if QR scanning failed
- whether a backup code is still available
- whether the admin needs to use `Reset My Admin 2FA`

### Dashboard numbers look unusual

Check:

- whether learner result records were saved
- whether retention queues have synced
- whether analytics are reading current learner data

### Contact threads look incomplete

Check:

- whether the learner account actually sent the message
- whether the admin is on the authorized inbox view
- whether the reply was saved successfully

---

## 12. Screenshot Checklist for This Manual

Use these screenshots when finalizing the admin document:

1. Admin 2FA setup page
2. Admin dashboard overview
3. Learner analytics modal
4. Retention indicators or due-card area
5. Contact inbox
6. Admin 2FA reset section
