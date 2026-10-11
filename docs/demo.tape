# OASB (Open Agent Security Benchmark) Demo
# Attack scenarios for evaluating agent security products
# Run: vhs docs/demo.tape

Output docs/oasb-demo.gif

Set Width 1200
Set Height 700
Set FontSize 20
Set FontFamily "JetBrains Mono"
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 20
Set Framerate 30
Set PlaybackSpeed 1.0

# Hidden setup: navigate to OASB directory
Hide
Type "cd ~/workspace/opena2a-org/oasb && clear"
Enter
Sleep 500ms
Show

# Title pause
Sleep 1s

# Step 1: Run the full benchmark (README.md states the test counts)
Type "npm test"
Enter
Sleep 8s

# Let users read the test summary
Sleep 4s

# Step 2: Generate the coverage report
Type "npm run report"
Enter
Sleep 3s

# Step 3: Show MITRE ATLAS coverage summary
Type "head -30 REPORT.generated.md"
Enter
Sleep 4s

# Final pause to read results
Sleep 3s
