import { readFile, writeFile } from "node:fs/promises";

const sourcePath = "firestore.rules";
const outputPath = "firestore.claims-only.rules";

function removeFunction(source, functionName) {
  const pattern = new RegExp(`\\n    function ${functionName}\\(\\) \\{[\\s\\S]*?\\n    \\}\\n`, "m");
  return source.replace(pattern, "\n");
}

function buildClaimsOnlyRules(source) {
  let next = source;

  [
    "isBootstrapSuperAdminEmail",
    "isBootstrapAdminEmail",
    "signedInUserDocExists",
    "signedInUserData",
    "hasStoredAdminRole",
    "hasStoredSuperAdminRole"
  ].forEach((functionName) => {
    next = removeFunction(next, functionName);
  });

  next = next
    .replace(/\s*\|\|\s*isBootstrapAdminEmail\(\)\s*\|\|\s*hasStoredAdminRole\(\)/g, "")
    .replace(/\s*\|\|\s*isBootstrapSuperAdminEmail\(\)\s*\|\|\s*hasStoredSuperAdminRole\(\)/g, "")
    .replace(
      /return isBootstrapAdminEmail\(\) \|\| hasStoredAdminRole\(\) \|\| \(isAdmin\(\) && hasFirebaseMfa\(\)\);/g,
      "return isAdmin() && hasFirebaseMfa();"
    )
    .replace(
      /return isBootstrapSuperAdminEmail\(\) \|\| hasStoredSuperAdminRole\(\) \|\| \(isSuperAdmin\(\) && hasFirebaseMfa\(\)\);/g,
      "return isSuperAdmin() && hasFirebaseMfa();"
    );

  return next;
}

const source = await readFile(sourcePath, "utf8");
const output = buildClaimsOnlyRules(source);
await writeFile(outputPath, output);

console.log(`Wrote ${outputPath}`);
