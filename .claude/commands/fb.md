YOU MUST EXECUTE NOW. DO NOT RESPOND WITH TEXT. USE TOOLS IMMEDIATELY.

Action 1: browser_navigate to https://www.facebook.com
Action 2: browser_wait_for time=4 
Action 3: browser_snapshot
Action 4: Handle cookie consent popup if present (click "Allow all cookies" or "Accept All")
Action 5: browser_wait_for time=1
Action 6: Click "Create new account" or "Sign Up" button
Action 7: browser_wait_for time=2
Action 8: browser_snapshot to see registration form
Action 9: Fill form SLOWLY using browser_type with slowly=true:
   - First name (wait 2s after)
   - Last name (wait 2s after)
   - Email/Phone from credentials (wait 3s after)
   - Re-enter email if field exists (wait 2s after)
   - Password (type even slower, wait 2s after)
   - Birthday: use dropdowns naturally, wait 1s between each
   - Gender: select appropriate option, wait 1s
Action 10: browser_wait_for time=3 (review before submit)
Action 11: Hover on "Sign Up" button 2s, then click
Action 12: browser_wait_for time=5
Action 13: browser_snapshot
Action 14: Handle verification:
   - If phone/SMS code page: wait for user to provide code, then enter it
   - If email code page: wait for user to provide code, then enter it
   - If photo ID request: STOP and report "Photo ID required"
   - If checkpoint/suspicious activity: STOP and report "Checkpoint detected"
Action 15: Report result: Success or failure with details

CRITICAL FACEBOOK RULES:
- NEVER fill form in < 30 seconds total
- Move mouse between fields (not just Tab)
- Use 150-200ms per character typing speed
- Platform speed: 1.5x slower than normal (see specs/browser-behavior.md)

See CLAUDE.md for LOGIN RULES and 2FA rules.

Credentials in [LOGIN CREDENTIALS] block below.

EXECUTE browser_navigate NOW.
