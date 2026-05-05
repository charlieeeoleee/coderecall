# Code Recall Super Admin Manual

## Document Purpose

This manual is for super admins such as:

- developers
- system managers
- lead maintainers

It explains the higher-level monitoring, security, and operational side of Code Recall, including 2FA oversight, retention oversight, privileged-role monitoring, and developer checks.

---

## 1. Super Admin Role Overview

Super admins have broader authority than admins.

They are responsible for:

- system oversight
- security monitoring
- privileged-role management
- retention and performance monitoring
- contact workflow supervision
- validating that the platform is functioning correctly

---

## 2. Current System Architecture

The current Code Recall system is primarily a multi-page web application built with:

- plain HTML
- CSS
- vanilla JavaScript modules and page scripts
- Firebase Authentication
- Firestore-backed data and rules

It is not currently built on a large frontend framework such as React, Vue, Angular, or Next.js.

Why this still works well:

- the project is page-based and script-driven
- features are modular by page
- Firebase handles auth and data persistence
- the system remains lightweight and practical for its current scale

Framework migration is not required right now.

---

## 3. Super Admin Dashboard

The super admin dashboard is used for system-wide oversight.

It can include:

- admin-level analytics
- privileged-role controls
- retention oversight
- email access control
- support visibility
- learner-risk monitoring

**Suggested image to insert here**
- `superadmin-01-dashboard-overview.png`

---

## 4. Super Admin 2FA

Super admins now use authenticator-based 2FA before they can enter the super-admin dashboard.

The setup flow includes:

- QR code enrollment
- manual setup key
- `Open in Authenticator`
- backup codes
- verification before super-admin access

The QR is now generated locally inside the project, so the setup flow no longer depends on an external QR image service.

Recovery options:

- backup codes
- `Reset My Super Admin 2FA`
- reset and re-enroll when the current device changes

**Suggested image to insert here**
- `superadmin-02-super-admin-mfa-setup.png`

---

## 5. 2FA Oversight

The super-admin dashboard now includes a `2FA Oversight` section for privileged accounts.

It helps track:

- privileged accounts
- enrolled vs pending 2FA
- verified today
- low backup reserves
- backup-code sign-ins
- recovery risk accounts
- recent privileged verification activity

This turns 2FA into a manageable operational control instead of a hidden login-only feature.

**Suggested image to insert here**
- `superadmin-03-2fa-oversight.png`

---

## 6. 2FA Recovery Policy

Super admins should treat backup codes as emergency recovery only.

Best practice:

- save backup codes during enrollment
- store them offline in a secure place
- use authenticator codes for normal access
- reset and re-enroll before backup reserves become too low

Watch for:

- accounts with few backup codes left
- accounts using backup-code sign-ins too often
- accounts still pending enrollment

---

## 7. Email Access Control

Super admins can grant privileged access by email without editing project files.

This area allows:

- granting `admin` access
- granting `super_admin` access
- removing granted email access

Safety behavior:

- removing any granted email now uses a strong warning
- removing the currently logged-in super-admin grant uses an extra-strong self-removal warning

Use this carefully because it affects real access and role syncing.

**Suggested image to insert here**
- `superadmin-04-email-access-control.png`

---

## 8. Retention Oversight

Super admins should monitor:

- whether the retention queue is too aggressive
- whether due-card load is becoming too heavy
- whether low-confidence answers are creating review items properly
- whether learners are actually recovering through flashcards and retakes

Retention is one of the main educational strengths of Code Recall, so this area should be monitored regularly.

---

## 9. System Configuration Review

Super admins and developers should be familiar with:

- memory review schedule controls
- first-correct-only XP rules
- certificate unlock conditions
- contact privacy rules
- role-based navigation
- local vs remote learner state

---

## 10. Developer and Release Checks

A recommended release or verification checklist:

1. Verify quiz and quiz-level flows
2. Verify confidence capture
3. Verify wrong-answer review and memory flashcards
4. Verify CSV export in Settings
5. Verify certificates unlock and render correctly
6. Verify admin analytics and learner modal analytics
7. Verify super-admin 2FA oversight and email access control
8. Verify private conversation history remains private

---

## 11. Troubleshooting for Super Admins

### 2FA enrollment or verification fails

Check:

- whether Firestore rules were redeployed after `securityProfiles` changes
- whether the current setup QR or manual key is being used
- whether the authenticator app is generating the current code
- whether backup codes have already been consumed

### 2FA oversight looks incomplete

Check:

- whether `securityProfiles` reads are allowed for super admins
- whether the browser is using updated files
- whether privileged users actually completed enrollment
- whether `lastVerifiedAt` and `lastVerificationMethod` are updating

### Email access actions fail

Check:

- whether the current account still has `super_admin` rights
- whether the current user removed their own active access
- whether Firestore permissions still allow privileged writes

### Retention or analytics look wrong

Check:

- learner retention queue payloads
- low-confidence capture
- result data writes
- wrong-answer review records
- admin and super-admin aggregation logic

---

## 12. Suggested Future Technical Documentation

A future deeper technical manual may include:

- Firebase collection structure
- Firestore rules explanation
- local storage keys and session flags
- page-to-script ownership map
- deployment and rollback workflow
- release smoke-test checklist

---

## 13. Screenshot Checklist for This Manual

Use these screenshots when finalizing the super-admin document:

1. Super-admin dashboard overview
2. Super-admin 2FA setup page
3. 2FA Oversight section
4. Email Access Control section
5. Recovery risk or backup reserve area
6. Super-admin 2FA reset area
