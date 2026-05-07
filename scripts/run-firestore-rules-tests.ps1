$RulesFile = if ($args.Count -gt 0) { $args[0] } else { "firestore.rules" }
$ConfigFile = if ($args.Count -gt 1) { $args[1] } else { "firebase.json" }
$ErrorActionPreference = "Stop"

$javaBin = "C:\Program Files\Java\jdk-25\bin"
if (Test-Path $javaBin) {
  $env:PATH = "$javaBin;$env:PATH"
  $env:Path = $env:PATH
}

$env:XDG_CONFIG_HOME = ".firebase-cli-config"
$env:NO_UPDATE_NOTIFIER = "1"
$env:FIRESTORE_RULES_FILE = $RulesFile

firebase emulators:exec --config $ConfigFile --only firestore "node --test tests/firestore.rules.test.mjs"
exit $LASTEXITCODE
