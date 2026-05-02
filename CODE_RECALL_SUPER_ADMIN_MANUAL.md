# Code Recall Super Admin Manual

## Document Purpose

This manual is for super admins such as:

- developers
- system managers
- lead maintainers

It explains the higher-level monitoring and system-management side of Code Recall, including retention oversight, analytics interpretation, and operational checks.

---

## 1. Super Admin Role Overview

Super admins have broader authority than admins.

They are responsible for:

- system oversight
- developer-level review of learner trends
- contact workflow supervision
- retention and performance monitoring
- validating that the platform is functioning correctly

## 2. Current System Architecture

The current Code Recall system is primarily a multi-page web application built with:

- plain HTML pages
- CSS stylesheets
- vanilla JavaScript modules and page scripts
- Firebase Firestore rules and cloud-backed data

It is not currently built on a full frontend framework such as React, Vue, Angular, or Next.js.

This means:

- the system is lightweight and direct
- pages are script-driven per route
- maintenance is simpler in small-to-mid scale usage
- future scaling may benefit from a framework, but one is not required right now

## 3. Super Admin Dashboard

The super admin dashboard is used to monitor system-wide health and performance.

It may include:

- all admin-level metrics
- broader retention oversight
- high-risk learner identification
- contact support visibility
- recovery trends

**Suggested image to insert here**
- Screenshot of super admin dashboard

## 4. Retention Oversight

Super admins should monitor:

- whether retention queue behavior is too aggressive or too weak
- whether flashcard recovery is actually happening
- whether low-confidence answers are becoming retention cards properly
- whether due-card counts are becoming unmanageable

This is important because retention is one of the core educational strengths of the platform.

## 5. System Configuration Review

Super admins and developers should be aware of:

- retention schedule controls in Settings
- XP anti-farming rules
- certificate unlock conditions
- role-based navigation
- contact visibility rules

## 6. Developer Checks

Recommended developer or super admin checks:

1. Verify quiz flows after code updates
2. Verify certificate generation after subject completion
3. Verify flashcard creation after wrong and low-confidence answers
4. Verify admin and super admin analytics after database updates
5. Verify private conversation history remains private

## 7. Developer Troubleshooting Notes

### If dashboard data looks delayed

Check:

- Firestore writes
- local cache values
- merge behavior between local and remote state

### If flashcards do not appear correctly

Check:

- retention queue payload
- confidence capture
- source question metadata
- image hydration fallback for image-based questions

### If certificates are incorrect

Check:

- completion flags
- result records
- certificate ID generation
- dual-completion condition logic

## 8. Do We Need a Framework?

Right now, a framework is not required for the system to work.

Why the current approach is acceptable:

- the project is already organized as page-based HTML, CSS, and JavaScript
- most features are already working on top of that structure
- Firebase-backed logic and local progress flows are already integrated
- moving to a framework now would add refactor cost without immediate learning-value gain

A framework may become useful later if you want:

- reusable UI components across many more pages
- more complex shared state management
- stronger routing patterns
- larger team collaboration on frontend code
- easier long-term scaling of the admin and analytics interfaces

Recommended decision:

- keep the current no-framework structure for now
- only consider a framework later if the project grows much larger or becomes harder to maintain

## 9. Suggested Documentation Expansion for Super Admins

A future technical manual may also include:

- Firebase structure
- Firestore rules explanation
- localStorage keys used by the system
- page-by-page script ownership
- deployment and rollback workflow
- test checklist before release

