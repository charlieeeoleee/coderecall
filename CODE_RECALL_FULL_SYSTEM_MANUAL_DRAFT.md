# Code Recall Full System Manual Draft

## Suggested Manual Length

This document is written to support a long-form manual of approximately 20 to 30 pages or more when transferred to a word processor. The final page count will depend on spacing, font size, margins, tables, and screenshots. To reach the desired length, insert screenshots after the relevant procedures, add figure captions, and place each major role section on a new page.

Recommended formatting:

- Font: Times New Roman or Arial
- Body size: 11 or 12 pt
- Headings: 14 to 16 pt
- Line spacing: 1.15 or 1.5
- Margins: 1 inch
- Screenshot width: 5.5 to 6.5 inches
- Caption style: Figure number, page name, and short description

---

# Title Page

## Code Recall System Manual

Prepared for the Code Recall Gamified Learning System

This manual documents the learner, guest, administrator, super administrator, and developer workflows of the Code Recall system. It explains how users operate the system, how administrators monitor learner activity, how super administrators manage privileged access, and how future developers may maintain and extend the project.

---

# Table of Contents

1. Introduction
2. System Overview
3. User Roles
4. Learner and Guest User Manual
5. Admin Manual
6. Super Admin Manual
7. Developer Manual
8. System File Structure
9. HTML, CSS, and JavaScript Organization
10. Data and Asset Management
11. Firebase and Security Structure
12. Contribution Guidelines
13. Maintenance and Future Development
14. Screenshot and Image Checklist
15. Appendices

---

# 1. Introduction

Code Recall is a web-based gamified learning system designed to support learners in studying Computer System Servicing-related topics. It provides structured subject paths, lesson modules, pre-tests, quizzes, post-tests, progress tracking, XP rewards, achievements, certificates, leaderboards, review tools, and administrative monitoring.

The system is designed for learners, teachers, administrators, system managers, and future developers. Learners use the platform to study and answer assessments. Administrators use the platform to monitor learner progress and respond to concerns. Super administrators manage privileged access and system oversight. Developers maintain the HTML, CSS, JavaScript, Firebase configuration, data files, and assets used by the platform.

This manual serves as both a user guide and a technical reference. It may be included as an appendix or supporting document in a thesis, capstone, software documentation package, or deployment handover.

---

# 2. System Overview

## 2.1 Purpose of the System

The main purpose of Code Recall is to provide an interactive and gamified environment where learners can review technical concepts, answer assessments, monitor their progress, and receive feedback. The system supports learning through structured sequencing: pre-test, modules, quiz levels, and post-test.

The system also supports retention by allowing learners to revisit missed questions and review memory flashcards. This helps reduce the possibility that learners complete assessments without revisiting weak topics.

## 2.2 Main System Features

Code Recall includes the following major features:

- Landing page for public access
- Login and registration
- Play as Guest mode
- Learner dashboard
- Subject selection
- Subject learning path
- Pre-test assessment
- Module and lesson pages
- Quiz levels
- Post-test assessment
- XP and level tracking
- Career role progression
- Achievements and badges
- Certificates
- Leaderboard
- Study history
- Review tools
- Contact and support page
- Admin dashboard
- Super admin dashboard
- Role-based navigation
- Firebase Authentication
- Firestore database integration
- Firebase security rules
- Local static assets for lesson images and sounds

## 2.3 System Users

The system supports four primary user categories:

1. Guest users
2. Registered learners
3. Admin users
4. Super admin users

Each user type has different access permissions and responsibilities.

---

# 3. User Roles

## 3.1 Guest User

A guest user can open the system and try the learning experience without creating an account. Guest mode is useful for demonstrations, testing, and first-time exploration. Guest progress is generally stored on the local browser and may not be permanently saved across devices.

Guest users can:

- Open the learner dashboard
- Select a subject
- Try the learning path
- Read modules
- Answer assessments
- Earn temporary XP
- Explore achievements and progress behavior

Guest users should be reminded that clearing browser data, changing devices, or logging out may remove guest progress.

## 3.2 Registered Learner

A registered learner has an account and can save progress more reliably. Registered learners can complete subjects, earn XP, unlock achievements, receive certificates, review missed questions, and continue their learning path later.

Registered learners can:

- Log in using their account
- Access the dashboard
- Complete pre-tests
- Read modules
- Answer quiz levels
- Complete post-tests
- Earn XP
- View achievements
- View certificates
- Check leaderboard standing
- Submit contact messages
- Review study history

## 3.3 Admin

An admin is responsible for monitoring learner progress and supporting instructional use of the system. Admin users may be teachers, facilitators, or assigned staff.

Admins can:

- Access the admin dashboard
- Monitor learner progress
- Review assessment performance
- View learner analytics
- Check weak topics
- Review contact messages
- Support learners with system concerns

## 3.4 Super Admin

A super admin has the highest level of system authority. This role is intended for system owners, lead maintainers, or authorized technical managers.

Super admins can:

- Access the super admin dashboard
- Monitor privileged accounts
- Review role access
- Manage or supervise admin access
- Monitor system health
- Review security-related activity
- Coordinate maintenance and updates

---

# 4. Learner and Guest User Manual

## 4.1 Opening the System

Users begin on the Code Recall landing page. The landing page introduces the system and provides navigation to login, registration, guest play, subjects preview, about page, contact page, and FAQ page.

Suggested screenshot:

- Landing page with the Code Recall title, navigation menu, Start Learning button, and Play as Guest button.

## 4.2 Play as Guest

The Play as Guest option allows a learner to enter the system without registration. This is useful when a learner wants to explore the system first before creating an account.

Steps:

1. Open the Code Recall landing page.
2. Click Play as Guest.
3. Wait for the dashboard to load.
4. Select a subject from the Start Learning section.
5. Follow the subject path from Pre-Test to Post-Test.
6. Register later if permanent progress saving is needed.

Important note:

Guest mode should not be treated as permanent account storage. Guest progress may depend on the current browser and device.

Suggested screenshot:

- Landing page with the Play as Guest button highlighted.

## 4.3 Account Login

Registered users should log in to save their learning records.

Steps:

1. Click Login or Start Learning.
2. Enter the registered email address.
3. Enter the password.
4. Submit the login form.
5. Wait for the system to redirect to the dashboard.

Suggested screenshot:

- Login and registration screen.

## 4.4 Learner Dashboard

The dashboard is the main home page for learners. It summarizes progress and provides access to the major learning tools.

Dashboard sections may include:

- XP
- Level
- Progress percentage
- Career Role
- Start Learning
- Continue Learning
- Review Tools
- Most Missed Topics
- Study History
- Progress by Subject
- Certificates
- Leaderboard Preview
- Achievements

The learner should use the dashboard to decide what to continue next. The Continue Learning section helps return to recent activities, while Review Tools help revisit missed or due items.

Suggested screenshot:

- Full dashboard view showing XP, level, progress, Start Learning, and review panels.

## 4.5 Selecting a Subject

The system currently supports the following learning areas:

- Computer Hardware
- Electrical Wiring and Electronics Circuit Components

Steps:

1. Open the dashboard.
2. Go to Start Learning.
3. Choose the desired subject.
4. The system opens the subject learning path.

Suggested screenshot:

- Start Learning subject cards on the dashboard.

## 4.6 Subject Learning Path

Each subject follows a required order:

1. Pre-Test
2. Modules
3. Quizzes
4. Post-Test

This sequence supports baseline assessment, guided learning, reinforcement, and final assessment.

Suggested screenshot:

- Subject page showing Pre-Test, Modules, Quizzes, and Post-Test cards.

## 4.7 Pre-Test Procedure

The Pre-Test measures what the learner knows before studying the lessons.

Steps:

1. Open the selected subject.
2. Click Pre-Test.
3. Read the question carefully.
4. Select the best answer.
5. Choose the confidence level if shown.
6. Click Next.
7. Continue until all questions are answered.
8. Review the result summary.

The Pre-Test may be restricted after completion to preserve the value of baseline measurement.

Suggested screenshot:

- Pre-Test question screen showing question, choices, progress bar, score, and Next button.

## 4.8 Module and Lesson Procedure

Modules contain the instructional content for each subject. They may include lesson notes, objectives, sections, images, diagrams, process guides, interactive checks, and study tips.

Steps:

1. Open Modules after completing the required Pre-Test.
2. Select the available difficulty or module level.
3. Read the module title and mission brief.
4. Review the lesson notes.
5. Read the objectives.
6. Follow the lesson path.
7. View the module images.
8. Complete interactive activities or quick checks if available.
9. Continue to the next module or quiz when ready.

Suggested screenshot:

- Module page showing lesson title, image strip, mission brief, objectives, lesson path, and module images.

## 4.9 Quiz Procedure

Quizzes reinforce what the learner studied in modules. Quiz levels may be organized by subject, difficulty, and level.

Steps:

1. Open Quizzes from the subject page.
2. Select the available quiz level.
3. Read each question carefully.
4. Select the answer.
5. Choose confidence level when shown.
6. Click Next.
7. Continue until the quiz is complete.
8. Review the result summary.

Quiz scores may affect XP, progress, review items, and achievements.

Suggested screenshot:

- Quiz page showing question, choices, score, progress bar, confidence panel, and Next button.

## 4.10 Post-Test Procedure

The Post-Test is the final assessment for the subject. It measures the learner's understanding after completing modules and quizzes.

Steps:

1. Complete the required subject activities.
2. Open Post-Test.
3. Answer each question.
4. Submit the assessment.
5. Review score, percentage, and XP earned.
6. Return to the subject page or dashboard.

Suggested screenshot:

- Post-Test question screen and final result modal.

## 4.11 Results and XP

After assessments, the system displays a result summary. This may include:

- Score
- Percentage
- XP earned
- Progress update
- Return button

XP rewards encourage completion, but the system should prioritize learning accuracy and review over repeated score farming.

Suggested screenshot:

- Result modal showing score, percentage, and XP earned.

## 4.12 Achievements and Badges

Achievements are unlocked when learners complete certain milestones. Examples may include completing activities, reaching XP milestones, or finishing a subject.

Steps:

1. Open the dashboard.
2. Go to Achievements.
3. Click an achievement to view its details.
4. Review whether the achievement is locked or unlocked.

Suggested screenshot:

- Achievements page or dashboard achievement section.

## 4.13 Certificates

Certificates are available after completing required subject paths.

Steps:

1. Complete the required activities for a subject.
2. Open Certificates from the dashboard or sidebar.
3. Select the available certificate.
4. View or download the certificate if the option is available.

Suggested screenshot:

- Certificates page showing locked and unlocked certificates.

## 4.14 Review Tools

Review tools help learners revisit difficult concepts. These tools may include wrong-answer review and memory flashcards.

Recommended use:

- Open Review after completing quizzes.
- Revisit missed questions.
- Review due memory flashcards.
- Return to the original activity if needed.

Suggested screenshot:

- Review page showing wrong-answer review or memory flashcards.

## 4.15 Study History

Study History records recent learner activity. It helps learners and administrators trace completed modules, quizzes, and assessments.

Suggested screenshot:

- History page showing recent activities.

## 4.16 Settings

The Settings page may include profile, display, sound, or account-related preferences depending on the current system configuration.

Suggested screenshot:

- Settings page.

---

# 5. Admin Manual

## 5.1 Admin Role Overview

Admins are responsible for monitoring learner progress and supporting the learning process. They should use the admin dashboard to review learner performance, identify weak topics, and respond to learner concerns.

Admin users may include teachers, facilitators, department staff, or authorized school personnel.

## 5.2 Admin Login

Steps:

1. Open the system login page.
2. Enter an admin account email and password.
3. Complete any additional security checks if required.
4. After login, open the dashboard.
5. Click the Admin link from the sidebar.

Suggested screenshot:

- Dashboard sidebar showing Admin link.

## 5.3 Admin Dashboard

The admin dashboard provides summary information about learner activity.

Common admin dashboard areas:

- Total learners
- Average XP
- Average pre-test score
- Average post-test score
- Module completion
- Subject progress
- Quiz performance
- Most missed topics
- Learner table
- Contact messages

Suggested screenshot:

- Admin dashboard overview.

## 5.4 Monitoring Learner Progress

Admins should monitor whether learners are completing the expected sequence:

1. Pre-Test
2. Modules
3. Quizzes
4. Post-Test

Learners who stop after the Pre-Test or fail to finish quizzes may need assistance.

## 5.5 Reviewing Learner Profiles

If the admin interface provides learner profile details, the admin may review:

- Learner name and email
- XP
- Subject progress
- Assessment results
- Quiz completion
- Weak topics
- Review history
- Certificate status

Suggested screenshot:

- Learner profile modal or learner details panel.

## 5.6 Reviewing Assessment Performance

Admins should compare Pre-Test and Post-Test results to determine improvement.

Useful interpretation:

- High pre-test and high post-test: learner has strong prior and final understanding.
- Low pre-test and high post-test: learner improved after using the system.
- Low pre-test and low post-test: learner may need intervention.
- High quiz activity but weak post-test: learner may be answering without retaining concepts.

## 5.7 Reviewing Weak Topics

Weak topics are topics or questions that learners frequently miss. Admins should use this information for remediation.

Admin actions:

- Identify repeated missed topics.
- Review whether lesson content is clear.
- Provide extra discussion or class support.
- Recommend memory review.
- Report unclear questions to developers.

## 5.8 Contact and Support Messages

Admins may review learner contact messages and respond when needed.

Steps:

1. Open the admin dashboard.
2. Locate the contact or inbox section.
3. Open a learner message.
4. Read the concern carefully.
5. Reply with clear instructions or support.
6. Monitor whether the learner follows up.

Suggested screenshot:

- Admin contact inbox.

## 5.9 Admin Best Practices

Admins should:

- Check learner progress regularly.
- Monitor learners who have low completion.
- Review weak topics weekly.
- Respond to learner messages professionally.
- Avoid changing data without proper reason.
- Coordinate with super admins for access or security concerns.

---

# 6. Super Admin Manual

## 6.1 Super Admin Role Overview

The Super Admin role is responsible for system-wide oversight, privileged access, security monitoring, and coordination with developers or maintainers.

Super admins should be assigned carefully because the role has broad authority.

## 6.2 Super Admin Login

Steps:

1. Open the login page.
2. Enter super admin credentials.
3. Complete any required multi-factor authentication.
4. Open the dashboard.
5. Click Super Admin from the sidebar.

Suggested screenshot:

- Dashboard sidebar showing Super Admin link.

## 6.3 Super Admin Dashboard

The super admin dashboard may include:

- User overview
- Admin overview
- Privileged role monitoring
- Security status
- MFA or 2FA status
- Contact workflow monitoring
- System analytics
- Audit information
- Deployment or configuration reminders

Suggested screenshot:

- Super Admin dashboard overview.

## 6.4 Role and Access Oversight

Super admins should regularly review accounts with elevated permissions.

Recommended checks:

- List all admin accounts.
- List all super admin accounts.
- Confirm each privileged account still requires access.
- Remove access from inactive or unauthorized users.
- Review role changes after system updates.

## 6.5 Security Monitoring

Super admins should monitor:

- Privileged account activity
- MFA enrollment
- Backup code use
- Repeated failed access attempts
- Unusual role changes
- Contact or support abuse

If a security issue is suspected, the super admin should coordinate with the developer or maintainer before making major changes.

## 6.6 Admin Support

Super admins should support admins by:

- Helping with access issues
- Reviewing dashboard errors
- Clarifying role permissions
- Coordinating content fixes
- Escalating technical bugs to developers

## 6.7 Super Admin Best Practices

Super admins should:

- Use a secure password.
- Enable multi-factor authentication if available.
- Keep backup codes private.
- Avoid sharing privileged accounts.
- Review admin access regularly.
- Document role changes.
- Avoid editing database records without backup or approval.

---

# 7. Developer Manual

## 7.1 Developer Overview

The Code Recall system is primarily a static multi-page web application supported by Firebase services. It uses HTML for page structure, CSS for design, JavaScript for behavior, Firebase Authentication for accounts, Firestore for database storage, and Firebase Hosting for deployment.

The project does not currently use a large front-end framework. Instead, it follows a page-based architecture where most pages have:

- One HTML file
- One matching CSS file
- One matching JavaScript file
- Shared utility JavaScript files
- Shared data files
- Shared assets

This makes the project easier to understand for future maintainers who are familiar with standard HTML, CSS, and JavaScript.

## 7.2 Main Folder Structure

The major folders and files are:

- HTML files in the root directory
- `styles/` for CSS files
- `scripts/` for JavaScript files
- `data/` for modules, quizzes, and assessment content
- `assets/` for images, sounds, icons, and media
- `functions/` for Firebase Cloud Functions
- `manuals/` for documentation files
- `tests/` for test files
- `firebase.json` for Firebase configuration
- `firestore.rules` for Firestore security rules
- `package.json` for scripts and dependencies

## 7.3 HTML Layer

HTML files define the structure of each page. They contain page sections, buttons, containers, forms, modals, and script/style references.

Important HTML files:

- `index.html`: Landing page
- `auth.html`: Login and registration page
- `dashboard.html`: Learner dashboard
- `subjects.html`: Subject listing page
- `subject.html`: Subject learning path page
- `module.html`: Lesson and module page
- `quiz.html`: Pre-test, quiz, and post-test page
- `review.html`: Review tools
- `history.html`: Study history
- `achievements.html`: Achievements and badges
- `certificates.html`: Certificates list
- `certificate.html`: Certificate preview
- `settings.html`: User settings
- `admin.html`: Admin dashboard
- `super-admin.html`: Super admin dashboard
- `contact.html`: Contact page
- `faq.html`: Frequently asked questions

Developer rules for HTML:

- Keep semantic structure clear.
- Use IDs only when JavaScript needs direct access.
- Use classes for styling.
- Keep navigation consistent.
- Link the correct CSS and JavaScript files.
- Update cache-busting query strings when needed.
- Do not expose admin links to normal users without role checks.

## 7.4 CSS Layer

CSS files control layout, color, spacing, responsiveness, card design, buttons, modals, typography, and light mode.

Important CSS files:

- `styles/landing.css`
- `styles/auth.css`
- `styles/dashboard.css`
- `styles/subjects.css`
- `styles/subject.css`
- `styles/module.css`
- `styles/quiz.css`
- `styles/review.css`
- `styles/history.css`
- `styles/achievements.css`
- `styles/certificates.css`
- `styles/settings.css`
- `styles/admin.css`

Developer rules for CSS:

- Keep page-specific styles in the matching page CSS file.
- Avoid unnecessary global style changes.
- Test desktop and mobile layouts.
- Ensure text does not overlap.
- Ensure buttons remain clickable.
- Ensure images scale correctly.
- Preserve dark mode and light mode behavior.
- Use consistent card spacing and border radius.

## 7.5 JavaScript Layer

JavaScript files control dynamic behavior, Firebase integration, authentication, progress tracking, assessment logic, role-based navigation, sounds, review tools, and admin views.

Important JavaScript files:

- `scripts/landing.js`
- `scripts/auth.js`
- `scripts/dashboard.js`
- `scripts/subjects.js`
- `scripts/subject.js`
- `scripts/module.js`
- `scripts/quiz.js`
- `scripts/review.js`
- `scripts/history.js`
- `scripts/achievements.js`
- `scripts/certificates.js`
- `scripts/settings.js`
- `scripts/admin.js`
- `scripts/super-admin.js`
- `scripts/firebase-config.js`
- `scripts/role-utils.js`
- `scripts/sound.js`
- `scripts/study-history-store.js`
- `scripts/review-store.js`
- `scripts/retention-store.js`

Developer rules for JavaScript:

- Identify the page owner before editing.
- Reuse existing helper functions.
- Keep role checks intact.
- Avoid duplicating progress logic.
- Validate data before saving.
- Avoid breaking guest mode.
- Test registered and guest flows.
- Check browser console errors.
- Keep Firebase writes intentional.

## 7.6 Data Layer

The `data/` folder stores subject content, module content, quiz questions, assessment questions, image references, and supplemental image data.

Important data files:

- `data/module-data.js`
- `data/module-images.js`
- `data/module-supplemental-images.js`
- `data/quiz-data.js`
- `data/quiz-data-hardware.js`
- `data/quiz-data-hardware-extra.js`
- `data/quiz-data-electrical.js`
- `data/quiz-data-electrical-extra.js`
- `data/hardware-assessment-data.js`
- `data/hardware-posttest-data.js`
- `data/electrical-posttest-data.js`

When adding new content:

1. Decide the subject.
2. Decide the difficulty.
3. Add lesson content to the correct data file.
4. Add images to the correct asset folder.
5. Reference images using correct relative paths.
6. Add quiz or assessment items.
7. Include correct answers and rationales.
8. Test the page in the browser.

## 7.7 Assets Layer

The `assets/` folder contains images, sounds, logos, icons, module media, quiz media, and other static files.

Common folders:

- `assets/modules/`
- `assets/quizzes/`
- `assets/sounds/`
- `assets/logo-dark.png`
- `assets/logo-light.png`
- `assets/favicon.png`

Asset guidelines:

- Use descriptive file names.
- Place assets in the correct subject folder.
- Optimize large images.
- Use JPG for photos and PNG/SVG for diagrams when appropriate.
- Confirm all paths load correctly.
- Avoid deleting assets that are still referenced by data files.

## 7.8 Firebase Layer

Firebase supports authentication, hosting, database storage, rules, and optional backend functions.

Important files:

- `firebase.json`
- `.firebaserc`
- `firestore.rules`
- `firestore.claims-only.rules`
- `functions/index.js`
- `scripts/firebase-config.js`
- `scripts/firebase-config.runtime.js`
- `scripts/manage-role-claims.mjs`
- `scripts/sync-firebase-mfa-profiles.mjs`

Developers should be careful when editing Firebase-related files because they affect authentication, database access, and deployment.

## 7.9 Firestore Security Rules

Firestore rules control who can read or write data. Developers must not weaken security rules without understanding the impact.

When changing rules:

1. Review the current rule behavior.
2. Identify which collections are affected.
3. Confirm role-based permissions.
4. Run available tests if possible.
5. Deploy only after verification.

## 7.10 Guest Mode Logic

Guest mode allows temporary use without authentication. Guest progress may use local browser storage.

When changing guest behavior:

- Do not assume a Firebase user exists.
- Keep local storage keys consistent.
- Test Play as Guest from the landing page.
- Test logout behavior.
- Ensure guest data does not grant admin access.

## 7.11 Role-Based Navigation

Role-based navigation determines which links appear to each user.

Important rule:

Only admins should see admin tools. Only super admins should see super admin tools.

Developers should test:

- Guest dashboard
- Learner dashboard
- Admin dashboard
- Super admin dashboard
- Logout and login transitions

---

# 8. Contribution Guidelines

## 8.1 How Future Developers Can Contribute

Future developers can contribute by adding content, fixing bugs, improving layouts, expanding analytics, strengthening security, improving accessibility, or adding new learning modules.

Recommended workflow:

1. Review the existing file structure.
2. Identify the relevant page.
3. Identify the matching CSS and JavaScript files.
4. Make a small focused change.
5. Test the changed page.
6. Test affected user roles.
7. Check the browser console.
8. Update documentation.
9. Commit with a clear message.
10. Submit the change for review.

## 8.2 Adding a New Subject

To add a new subject, developers should:

1. Add subject metadata.
2. Add modules to the data folder.
3. Add quiz data.
4. Add pre-test and post-test data.
5. Add subject images.
6. Update subject selection pages.
7. Update dashboard progress calculations.
8. Update certificate logic if needed.
9. Test the full learning path.

## 8.3 Adding New Module Images

Steps:

1. Place the image inside the correct asset folder.
2. Use a clear file name.
3. Add the path to the module image data file.
4. Confirm the module page loads the image.
5. Check mobile responsiveness.

## 8.4 Adding Quiz Questions

Each question should include:

- Question text
- Choices
- Correct answer
- Rationale or explanation
- Optional image reference
- Subject and level mapping

Question quality guidelines:

- Use clear wording.
- Avoid trick questions unless instructionally necessary.
- Ensure only one answer is correct.
- Provide helpful rationale.
- Test that the correct answer is recorded properly.

## 8.5 Improving UI

When improving the interface:

- Keep the current gamified visual identity.
- Use consistent button styles.
- Avoid overcrowded layouts.
- Ensure text remains readable.
- Test small screens.
- Check both dark and light modes.

## 8.6 Testing Checklist

Before submitting changes, test:

- Landing page loads.
- Login page loads.
- Play as Guest works.
- Dashboard loads.
- Subject page opens.
- Pre-Test opens.
- Module page opens.
- Quiz page opens.
- Post-Test opens.
- Results modal appears.
- Review page opens.
- Certificates page opens.
- Achievements page opens.
- Admin access remains protected.
- Super admin access remains protected.

---

# 9. Maintenance and Future Development

## 9.1 Recommended Maintenance Tasks

Maintenance should include:

- Checking broken links
- Checking missing images
- Reviewing Firebase rules
- Reviewing admin access
- Reviewing super admin access
- Backing up important data
- Testing the guest flow
- Testing learner accounts
- Reviewing reported content issues
- Updating documentation

## 9.2 Suggested Future Improvements

Future improvements may include:

- More subjects
- More modules
- More quiz levels
- Teacher reports
- Printable learner progress reports
- Expanded certificate templates
- More analytics charts
- Better accessibility support
- Improved offline support
- More automated tests
- Expanded review algorithm
- Stronger admin audit logs
- Improved deployment documentation

---

# 10. Screenshot and Image Checklist

Use the following screenshots to make the manual longer, clearer, and more professional.

## 10.1 User and Guest Screenshots

1. Landing page
2. Login and registration page
3. Play as Guest button
4. Dashboard overview
5. Start Learning section
6. Subject selection
7. Subject learning path
8. Pre-Test page
9. Module page
10. Module images section
11. Quiz page
12. Confidence panel
13. Post-Test page
14. Result modal
15. Achievements page
16. Certificates page
17. Leaderboard page
18. Review page
19. Study History page
20. Settings page

## 10.2 Admin Screenshots

1. Admin navigation link
2. Admin dashboard overview
3. Learner table
4. Learner profile or progress modal
5. Assessment performance section
6. Most missed topics
7. Contact inbox
8. Admin security or MFA page if used

## 10.3 Super Admin Screenshots

1. Super Admin navigation link
2. Super Admin dashboard overview
3. User or role management section
4. Privileged access section
5. Security or MFA oversight section
6. Audit or monitoring section
7. Contact workflow monitoring

## 10.4 Developer Screenshots

1. Project folder structure
2. Root HTML files
3. Styles folder
4. Scripts folder
5. Data folder
6. Assets folder
7. Firebase configuration files
8. Example module data file
9. Example quiz data file
10. Browser console showing no errors after testing

---

# Appendix A: Quick Role Summary

| Role | Main Purpose | Main Access |
| --- | --- | --- |
| Guest | Try the system without account | Temporary learner access |
| Learner | Complete learning path | Dashboard, subjects, assessments, review, certificates |
| Admin | Monitor learners | Admin dashboard and learner analytics |
| Super Admin | Manage system oversight | Super admin dashboard and privileged access |
| Developer | Maintain and extend system | Source files, Firebase config, data, assets |

---

# Appendix B: Recommended Figure Captions

Use these captions under screenshots:

- Figure 1. Code Recall landing page.
- Figure 2. Login and registration interface.
- Figure 3. Play as Guest option.
- Figure 4. Learner dashboard overview.
- Figure 5. Subject learning path.
- Figure 6. Pre-Test interface.
- Figure 7. Module lesson page.
- Figure 8. Quiz interface.
- Figure 9. Post-Test interface.
- Figure 10. Assessment result summary.
- Figure 11. Achievements and badges page.
- Figure 12. Certificates page.
- Figure 13. Admin dashboard.
- Figure 14. Learner analytics view.
- Figure 15. Super Admin dashboard.
- Figure 16. Project file structure.

---

# Appendix C: Developer Handover Notes

Before handing over the system to another developer, provide:

1. Source code folder
2. Firebase project access
3. Firebase configuration details
4. Role management instructions
5. Deployment instructions
6. Firestore rules explanation
7. Content editing instructions
8. Asset naming conventions
9. Test account list if allowed
10. Known issues and future work

Developers should not make large structural changes without first understanding how learner progress, XP, certificates, role navigation, and Firestore rules interact.

