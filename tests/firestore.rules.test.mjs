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
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";

let testEnv;

const projectId = "coderecall-rules-test";
const rulesFile = process.env.FIRESTORE_RULES_FILE || "firestore.rules";
const isClaimsOnlyRules = rulesFile.includes("claims-only");

function authContext(uid, token = {}) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

function unauthContext() {
  return testEnv.unauthenticatedContext().firestore();
}

function mfaToken(extra = {}) {
  return {
    ...extra,
    firebase: {
      sign_in_second_factor: "phone"
    }
  };
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

test("admin custom claims require Firebase MFA for cross-user reads", async () => {
  const adminWithoutMfa = authContext("claimAdmin", {
    email: "claim-admin@example.com",
    role: "admin",
    admin: true
  });
  const adminWithMfa = authContext("claimAdmin", mfaToken({
    email: "claim-admin@example.com",
    role: "admin",
    admin: true
  }));

  await assertFails(getDoc(doc(adminWithoutMfa, "users", "learner")));
  await assertSucceeds(getDoc(doc(adminWithMfa, "users", "learner")));
});

test("super-admin custom claims with MFA can manage user access fields", async () => {
  const db = authContext("claimSuper", mfaToken({
    email: "super@example.com",
    role: "super_admin",
    admin: true,
    super_admin: true
  }));

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

test("admins with MFA can read unassigned or assigned tickets but not another admin's assigned ticket", async () => {
  const db = authContext("claimAdmin", mfaToken({
    email: "claim-admin@example.com",
    role: "admin",
    admin: true
  }));

  await assertSucceeds(getDoc(doc(db, "contactMessages", "ownedTicket")));
  await assertFails(getDoc(doc(db, "contactMessages", "assignedOther")));
});

test("super-admins with MFA can list privileged collections", async () => {
  const db = authContext("claimSuper", mfaToken({
    email: "super@example.com",
    role: "super_admin",
    admin: true,
    super_admin: true
  }));

  const usersByRole = query(collection(db, "users"), where("role", "==", "admin"));
  await assertSucceeds(getDocs(usersByRole));
  await assertSucceeds(getDocs(collection(db, "accessRoles")));
});

test("stored role access matches the selected rules mode", async () => {
  const db = authContext("adminStored", { email: "stored-admin@example.com" });

  if (isClaimsOnlyRules) {
    await assertFails(getDoc(doc(db, "users", "learner")));
  } else {
    await assertSucceeds(getDoc(doc(db, "users", "learner")));
  }
});
