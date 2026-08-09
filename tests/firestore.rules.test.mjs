import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";

let testEnv;

const projectId = "coderecall-rules-test";
const rulesFile = process.env.FIRESTORE_RULES_FILE || "firestore.rules";

function authContext(uid, token = {}) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

function unauthContext() {
  return testEnv.unauthenticatedContext().firestore();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(rulesFile, "utf8")
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", "learner"), {
      email: "learner@example.com",
      name: "Learner",
      role: "user",
      status: "active",
      progress: {
        role: "user"
      },
      xp: 10
    });
    await setDoc(doc(db, "users", "adminStored"), {
      email: "stored-admin@example.com",
      name: "Stored Admin",
      role: "admin",
      status: "active",
      progress: {
        role: "admin"
      }
    });
    await setDoc(doc(db, "contactMessages", "ownedTicket"), {
      ticketId: "TICKET-1",
      category: "Learning Concern",
      subject: "Help",
      message: "Need help",
      status: "open",
      createdByUid: "learner",
      createdByName: "Learner",
      createdByEmail: "learner@example.com",
      assignedAdminUid: "",
      assignedAdminName: "",
      assignedAdminRole: "",
      conversationHistory: []
    });
    await setDoc(doc(db, "contactMessages", "assignedOther"), {
      ticketId: "TICKET-2",
      category: "Learning Concern",
      subject: "Private",
      message: "Assigned elsewhere",
      status: "open",
      createdByUid: "otherLearner",
      createdByName: "Other",
      createdByEmail: "other@example.com",
      assignedAdminUid: "otherAdmin",
      assignedAdminName: "Other Admin",
      assignedAdminRole: "admin",
      conversationHistory: []
    });
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test("signed-out users cannot read user documents", async () => {
  const db = unauthContext();
  await assertFails(getDoc(doc(db, "users", "learner")));
});

test("users can read their own profile but cannot promote themselves", async () => {
  const db = authContext("learner", { email: "learner@example.com" });

  await assertSucceeds(getDoc(doc(db, "users", "learner")));
  await assertSucceeds(updateDoc(doc(db, "users", "learner"), {
    name: "Updated Learner"
  }));
  await assertSucceeds(updateDoc(doc(db, "users", "learner"), {
    resumeActivity: {
      kind: "module",
      subject: "hardware",
      updatedAt: "2026-08-09T00:00:00.000Z"
    }
  }));
  await assertFails(updateDoc(doc(db, "users", "learner"), {
    xp: 999999
  }));
  await assertFails(updateDoc(doc(db, "users", "learner"), {
    progress: {
      role: "user",
      hardware_pretest: true
    }
  }));
  await assertFails(updateDoc(doc(db, "users", "learner"), {
    results: {
      hardware_pretest: {
        score: 30,
        total: 30
      }
    }
  }));
  await assertFails(updateDoc(doc(db, "users", "otherLearner"), {
    name: "Not Mine"
  }));
  await assertFails(updateDoc(doc(db, "users", "learner"), {
    role: "admin",
    progress: {
      role: "admin"
    }
  }));
});

test("admin custom claims allow cross-user reads in Spark app-level 2FA mode", async () => {
  const claimAdmin = authContext("claimAdmin", {
    email: "claim-admin@example.com",
    role: "admin",
    admin: true
  });

  await assertSucceeds(getDoc(doc(claimAdmin, "users", "learner")));
});

test("super-admin custom claims can manage user access fields in Spark app-level 2FA mode", async () => {
  const db = authContext("claimSuper", {
    email: "super@example.com",
    role: "super_admin",
    admin: true,
    super_admin: true
  });

  await assertSucceeds(updateDoc(doc(db, "users", "learner"), {
    role: "admin",
    status: "active",
    progress: {
      role: "admin"
    }
  }));
});

test("normal users can read only their own contact tickets", async () => {
  const db = authContext("learner", { email: "learner@example.com" });

  await assertSucceeds(getDoc(doc(db, "contactMessages", "ownedTicket")));
  await assertFails(getDoc(doc(db, "contactMessages", "assignedOther")));
});

test("signed-in users can write only safe security audit events", async () => {
  const db = authContext("learner", { email: "learner@example.com" });

  await assertSucceeds(setDoc(doc(db, "auditLogs", "safeDeniedRoute"), {
    action: "denied_admin_route",
    details: "Denied direct admin route visit.",
    metadata: {
      route: "admin.html"
    },
    actorUid: "learner",
    actorEmail: "learner@example.com",
    createdAt: serverTimestamp()
  }));

  await assertFails(setDoc(doc(db, "auditLogs", "spoofedActor"), {
    action: "denied_admin_route",
    details: "Spoofed actor.",
    actorUid: "someoneElse",
    actorEmail: "learner@example.com",
    createdAt: serverTimestamp()
  }));

  await assertFails(setDoc(doc(db, "auditLogs", "arbitraryAction"), {
    action: "role_changed",
    details: "Should not be client-writable.",
    actorUid: "learner",
    actorEmail: "learner@example.com",
    createdAt: serverTimestamp()
  }));

  await assertFails(getDoc(doc(db, "auditLogs", "safeDeniedRoute")));
});

test("contact tickets must use the approved learner-owned shape", async () => {
  const db = authContext("learner", { email: "learner@example.com" });
  const safeTicket = {
    ticketId: "TCK-123456789",
    category: "feedback",
    subject: "Question about a lesson",
    message: "I need help understanding the module.",
    status: "open",
    createdByUid: "learner",
    createdByName: "Learner",
    createdByEmail: "learner@example.com",
    createdByRole: "user",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    assignedAdminUid: "",
    assignedAdminName: "",
    assignedAdminRole: "",
    replyText: "",
    replyHistory: [],
    conversationHistory: [{
      type: "learner",
      text: "I need help understanding the module.",
      byUid: "learner",
      byName: "Learner",
      byRole: "user",
      at: "2026-08-09T00:00:00.000Z"
    }],
    repliedAt: null,
    repliedByUid: "",
    repliedByName: "",
    repliedByRole: "",
    resolvedAt: null,
    resolvedByUid: "",
    resolvedByName: "",
    resolvedByRole: ""
  };

  await assertSucceeds(setDoc(doc(db, "contactMessages", "safeTicket"), safeTicket));
  await assertFails(setDoc(doc(db, "contactMessages", "oversizedTicket"), {
    ...safeTicket,
    message: "x".repeat(3001),
    conversationHistory: [{
      ...safeTicket.conversationHistory[0],
      text: "x".repeat(3001)
    }]
  }));
  await assertFails(setDoc(doc(db, "contactMessages", "spoofedTicket"), {
    ...safeTicket,
    createdByUid: "someoneElse"
  }));
});

test("users cannot create profiles with preloaded gamification data", async () => {
  const db = authContext("newLearner", { email: "new@example.com" });

  await assertSucceeds(setDoc(doc(db, "users", "newLearner"), {
    email: "new@example.com",
    name: "New Learner",
    role: "user",
    status: "active",
    progress: {},
    results: {},
    xp: 0,
    xpWeekly: 0,
    xpChange: 0
  }));

  const loadedDb = authContext("loadedLearner", { email: "loaded@example.com" });
  await assertFails(setDoc(doc(loadedDb, "users", "loadedLearner"), {
    email: "new@example.com",
    name: "Loaded Learner",
    role: "user",
    status: "active",
    progress: {
      hardware_pretest: true
    },
    results: {},
    xp: 500,
    xpWeekly: 500,
    xpChange: 500
  }));
});

test("public leaderboard entries must mirror owner score fields", async () => {
  const db = authContext("learner", { email: "learner@example.com" });

  await assertSucceeds(setDoc(doc(db, "leaderboard_public", "learner"), {
    name: "Learner",
    photo: "https://i.pravatar.cc/40?img=12",
    xp: 10,
    xpWeekly: 0,
    xpChange: 0,
    updatedAt: "2026-08-09T00:00:00.000Z"
  }));

  await assertFails(setDoc(doc(db, "leaderboard_public", "learner"), {
    name: "Learner",
    photo: "https://i.pravatar.cc/40?img=12",
    xp: 999999,
    xpWeekly: 999999,
    xpChange: 999999,
    updatedAt: "2026-08-09T00:00:00.000Z"
  }));

  const otherDb = authContext("otherLearner", { email: "other@example.com" });
  await assertFails(setDoc(doc(otherDb, "leaderboard_public", "learner"), {
    name: "Other",
    photo: "https://i.pravatar.cc/40?img=12",
    xp: 10,
    xpWeekly: 0,
    xpChange: 0,
    updatedAt: "2026-08-09T00:00:00.000Z"
  }));
});

test("sanitized client error reports can be created but not read by normal users", async () => {
  const db = authContext("learner", { email: "learner@example.com" });

  await assertSucceeds(setDoc(doc(db, "clientErrorReports", "safeReport"), {
    event: "uncaught_error",
    message: "Something failed",
    source: "dashboard.html",
    route: "/dashboard",
    userAgent: "Rules test",
    createdAt: serverTimestamp()
  }));

  await assertFails(getDoc(doc(db, "clientErrorReports", "safeReport")));
  await assertFails(setDoc(doc(db, "clientErrorReports", "oversizedReport"), {
    event: "uncaught_error",
    message: "x".repeat(241),
    source: "dashboard.html",
    route: "/dashboard",
    userAgent: "Rules test",
    createdAt: serverTimestamp()
  }));
});

test("admins can read unassigned or assigned tickets but not another admin's assigned ticket", async () => {
  const db = authContext("claimAdmin", {
    email: "claim-admin@example.com",
    role: "admin",
    admin: true
  });

  await assertSucceeds(getDoc(doc(db, "contactMessages", "ownedTicket")));
  await assertFails(getDoc(doc(db, "contactMessages", "assignedOther")));
});

test("super-admins can list privileged collections in Spark app-level 2FA mode", async () => {
  const db = authContext("claimSuper", {
    email: "super@example.com",
    role: "super_admin",
    admin: true,
    super_admin: true
  });

  const usersByRole = query(collection(db, "users"), where("role", "==", "admin"));
  await assertSucceeds(getDocs(usersByRole));
  await assertSucceeds(getDocs(collection(db, "accessRoles")));
});

test("privileged users can manage their own app-level 2FA profile", async () => {
  const claimAdmin = authContext("claimAdmin", {
    email: "claim-admin@example.com",
    role: "admin",
    admin: true
  });

  await assertSucceeds(setDoc(doc(claimAdmin, "securityProfiles", "claimAdmin"), {
    uid: "claimAdmin",
    email: "claim-admin@example.com",
    role: "admin",
    appMfaEnabled: true,
    appMfaSource: "app_totp",
    totpSecret: "BASE32SECRET",
    backupCodeHashes: ["hash-one", "hash-two"],
    backupCodesRemaining: 2,
    lastVerifiedAt: "2026-05-09T00:00:00.000Z",
    lastVerificationMethod: "app_totp_enrollment",
    updatedAt: "2026-05-09T00:00:00.000Z"
  }));

  await assertFails(setDoc(doc(claimAdmin, "securityProfiles", "otherUser"), {
    uid: "otherUser",
    email: "claim-admin@example.com",
    role: "admin",
    appMfaEnabled: true,
    appMfaSource: "app_totp",
    totpSecret: "BASE32SECRET",
    backupCodeHashes: [],
    backupCodesRemaining: 0
  }));

  await assertFails(setDoc(doc(claimAdmin, "securityProfiles", "claimAdmin"), {
    uid: "claimAdmin",
    email: "claim-admin@example.com",
    role: "super_admin",
    appMfaEnabled: true,
    appMfaSource: "app_totp",
    totpSecret: "BASE32SECRET",
    backupCodeHashes: [],
    backupCodesRemaining: 0
  }));
});

test("stored role access allows cross-user reads in Spark app-level 2FA mode", async () => {
  const storedAdminWithoutMfa = authContext("adminStored", { email: "stored-admin@example.com" });

  await assertSucceeds(getDoc(doc(storedAdminWithoutMfa, "users", "learner")));
});
