# Code Recall User Manual

## Document Purpose

This manual is for:

- guest users
- registered learners

It explains the learner side of Code Recall, including login, dashboard use, subjects, assessments, flashcards, certificates, contact support, and settings.

---

## 1. System Overview

Code Recall is a gamified learning platform for Computer System Servicing learners. It combines guided content, assessment, review tools, memory-retention flashcards, XP progression, and certificates.

Main learner features:

- subject-based learning flow
- pre-tests and post-tests
- quiz levels with confidence-based answering
- wrong-answer review
- memory flashcards
- XP, levels, and progress tracking
- certificate vault
- contact and support messaging

**Suggested image to insert here**
- `user-01-dashboard-overview.png`

---

## 2. User Types

### 2.1 Guest User

Guest users can explore the platform without creating a permanent account.

Guest users can:

- open the dashboard
- access subjects
- read modules
- answer quizzes
- build temporary progress on the current device

Important notes:

- guest progress is temporary
- guest data is stored only on the current device
- logging out or clearing local data may remove guest progress

### 2.2 Registered Learner

Registered learners can save progress to their account.

Registered learners can:

- keep permanent subject progress
- earn XP and levels
- unlock certificates
- use long-term review and retention tools
- send support messages and read replies

**Suggested image to insert here**
- `user-02-login-page.png`

---

## 3. Main Learning Flow

Each subject follows this order:

1. Pre-Test
2. Modules
3. Quiz Levels
4. Post-Test
5. Certificate Unlock

Why this matters:

- the pre-test measures starting knowledge
- modules deliver the guided lesson content
- quiz levels reinforce the lesson in smaller steps
- the post-test checks final understanding
- the certificate confirms completion

**Suggested image to insert here**
- `user-03-subject-flow.png`

---

## 4. Dashboard

The dashboard is the learner’s main home page.

It shows:

- XP
- level
- progress percentage
- subject shortcuts
- continue-learning panel
- review tools
- due memory-review count
- contact or reply indicators

The dashboard helps learners see what to continue next and what to review first.

**Suggested image to insert here**
- `user-04-dashboard-full.png`

---

## 5. Modules

Modules contain the lesson content for each subject.

Inside a module, learners may see:

- lesson sections
- images and examples
- a reading progress rail
- checkpoints
- quick checks
- next-step guidance

Modules are designed for guided reading, not random page jumping.

**Suggested image to insert here**
- `user-05-module-page.png`

---

## 6. Assessments

### 6.1 Pre-Test

The pre-test checks what the learner knows before the lesson flow.

Purpose:

- measure baseline understanding
- compare later against post-test performance

### 6.2 Quiz Levels

Quiz levels are smaller grouped quizzes inside the subject path.

Important rules:

- quiz levels support confidence-based answering
- some retry-locked items can be attempted up to 3 times before they are delayed until the next day
- XP follows first-correct rules only

### 6.3 Post-Test

The post-test measures the learner’s understanding after finishing the subject path.

Purpose:

- confirm progress after study
- support certificate unlock
- feed learner and admin analytics

**Suggested images to insert here**
- `user-06-quiz-page.png`
- `user-07-quiz-level-page.png`

---

## 7. Confidence-Based Answering

After choosing an answer, the learner also chooses a confidence level:

- `Sure`
- `Somewhat Sure`
- `Guessing`

This helps the system detect weak memory even when the answer is technically correct.

How it works:

- `Sure + correct` does not create a new flashcard
- `Somewhat Sure + correct` may create a retention card
- `Guessing + correct` may create a retention card
- wrong answers may create review and retention items

If a flashcard popup appears, it can mean one of two things:

- the current answer was added to memory review
- the learner already had due memory cards from earlier work

---

## 8. Wrong-Answer Review

Wrong-answer review helps learners revisit previously missed questions.

Learners can:

- see missed questions
- review the correct answer
- read the rationale
- open the original source activity again

This supports targeted recovery instead of restarting the full subject flow.

**Suggested image to insert here**
- `user-08-wrong-answer-review.png`

---

## 9. Memory Flashcards

Memory flashcards are used for retention practice.

Flashcards can be created when:

- an answer is wrong
- an answer is correct but the learner chooses:
  - `Somewhat Sure`
  - `Guessing`

Flashcard actions:

- `Need Again`
- `Hard Recall`
- `Easy Recall`
- `Open Source`

Meaning:

- `Need Again` means the learner still does not remember it well
- `Hard Recall` means the learner remembered it with effort
- `Easy Recall` means the learner remembered it strongly
- `Open Source` returns to the source quiz or lesson

The flashcard schedule can use immediate review first, then later spaced intervals based on settings.

**Suggested image to insert here**
- `user-09-memory-flashcards.png`

---

## 10. Recovery Feedback

When a learner later fixes questions that were previously missed, the result modal can show a recovery summary.

Example:

`Recovery win: you fixed 3 previously missed questions in this attempt.`

This helps learners understand that correcting weak areas matters, not only final score.

**Suggested image to insert here**
- `user-10-recovery-summary.png`

---

## 11. XP and Anti-Farming Rules

Code Recall prevents XP farming.

Current rule:

- XP is awarded only when a question becomes correct for the first time

This means:

- first-time correct answer gives XP
- wrong first, then correct later gives XP when corrected
- replaying an already-correct question gives no extra XP

This keeps progression fair and rewards real improvement.

---

## 12. Score and Progress Reporting

Assessment pages and subject progress views can show:

- raw score
- percentage
- XP earned
- assessment bars for:
  - pre-test
  - quiz track
  - post-test

The dashboard and subject pages help learners monitor both progress and performance.

---

## 13. Certificates and Certificate Vault

Certificates unlock after completing subject requirements.

Current certificate types include:

- Computer Hardware Certificate
- Electrical Wiring Certificate
- Dual Subject Completion Certificate

The certificate vault allows learners to:

- search certificates
- filter by status or subject
- sort certificate entries
- view issued certificate history
- open and download certificates

**Suggested images to insert here**
- `user-11-certificate-vault.png`
- `user-12-certificate-preview.png`

---

## 14. Contact Us

The Contact Us page allows learners to send:

- concerns
- comments
- suggestions
- learning-related questions
- system-related feedback

Learners can also:

- read admin replies
- view their own conversation history

Important privacy note:

- learner conversations are intended to stay private to the learner and the authorized admin side

**Suggested image to insert here**
- `user-13-contact-page.png`

---

## 15. Settings

The Settings page can include:

- profile settings
- display name and image
- theme preferences
- sound and music controls
- auto-advance behavior
- progress overview
- memory review schedule

### 15.1 System Actions

Current System Actions include:

- `Logout`
- `Reset Hardware Subject`
- `Reset Electrical Subject`
- `Clear Memory Review`
- `Clear Wrong-Answer Review`
- `Reset Progress`
- `Export Progress Report (CSV)`
- `Reset Contact Alerts`
- `Refresh Role Access`
- `Clear Local Data`

### 15.2 Progress Export

`Export Progress Report (CSV)` downloads a CSV file that can be opened in Excel.

This export is useful for:

- personal progress backup
- teacher review
- support and troubleshooting

**Suggested image to insert here**
- `user-14-settings-page.png`

---

## 16. Troubleshooting for Learners

### Flashcards appear often

Possible reasons:

- repeated wrong answers
- low-confidence correct answers
- short retention schedule settings
- due cards from earlier subject work

### A flashcard popup appears after a correct answer

If the answer was `Sure + correct`, the popup usually means the learner already had due memory cards from earlier. It does not always mean the current answer created a new card.

### XP does not increase after replaying

This is expected if the learner already earned XP for those questions before.

### Certificate is still locked

Check whether all required parts were completed:

- pre-test
- modules
- quiz levels
- post-test

### Guest progress disappeared

Guest mode is temporary and device-based. Registering is recommended for permanent saved progress.

---

## 17. Screenshot Checklist for This Manual

Use these screenshots when finalizing the learner document:

1. Login page
2. Learner dashboard
3. Subject flow page
4. Module page
5. Quiz page
6. Quiz-level page
7. Wrong-answer review
8. Memory flashcards
9. Recovery result modal
10. Certificate vault
11. Certificate preview
12. Contact page
13. Settings page
