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
