# OASB (Open Agent Security Benchmark) Demo
# Runs the AI-layer scenario files (AT-AI-*) against ARP (arp-guard), the
# reference adapter, and writes the report of that run. It runs those files
# and not the whole suite, which npm test runs; docs/test-catalog.md states
# the totals of the suite.
# Run from the root of a clone, after npm ci: vhs docs/demo.tape
# docs/captures/demo.json describes the recording in docs/oasb-demo.gif and
# holds the SHA-256 of this file and of the GIF; scripts/doc-facts.test.mjs
# fails when either has changed since. After a change here, record again.

Output docs/oasb-demo.gif

Set Width 1200
Set Height 760
Set FontSize 18
Set FontFamily "JetBrains Mono"
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 20
Set Framerate 30
Set PlaybackSpeed 1.0

# Hidden setup: clear the screen. The shell starts in the directory vhs runs
# in, the repository root.
Hide
Type "clear"
Enter
Sleep 500ms
Show

# Title pause
Sleep 1s

# Step 1: Run the AI-layer scenario files, and write their results as a vitest
# JSON report, test-results.json, for step 2
Type "npx vitest run AT-AI --reporter=default --reporter=json --outputFile=test-results.json"
Enter
Sleep 6s

# Step 2: Write REPORT.generated.md from test-results.json
Type "npm run report"
Enter
Sleep 4s

# Step 3: Show the product under test and the Summary of the run, on a screen
# cleared out of the recording
Hide
Type "clear"
Enter
Sleep 500ms
Show
Type "head -24 REPORT.generated.md"
Enter
Sleep 7s

# Step 4: Show the MITRE ATLAS techniques the scenario files map, read from
# the ATLAS header of each file
Hide
Type "clear"
Enter
Sleep 500ms
Show
Type "grep -A 18 'Unique ATLAS' REPORT.generated.md"
Enter
Sleep 8s
