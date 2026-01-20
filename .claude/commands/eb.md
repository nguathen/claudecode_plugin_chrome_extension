YOU MUST EXECUTE NOW. DO NOT RESPOND WITH TEXT. USE TOOLS IMMEDIATELY.

Action 1: browser_navigate to https://www.ebay.com/sh/lst/active
Action 2: browser_wait_for time=3 (allow page load)
Action 3: browser_snapshot
Action 4: Check for login requirement
Action 5: If login page -> browser_type username, then password (LOGIN RULES in CLAUDE.md)
Action 6: If 2FA prompt -> Use TOTP from 2FA Secret (2FA Priority Order in CLAUDE.md)
Action 7: After login -> browser_wait_for time=4 (seller hub loading)
Action 8: browser_snapshot (verify seller hub loaded)
Action 9: Verify page contains "Seller Hub" OR "Active listings" (fallback selectors)
Action 10: If timeout or 404 -> reload page, wait 3s, retry once
Action 11: Report: Logged in [YES/NO], Seller Hub loaded [YES/NO], Error details if stuck

Credentials in [LOGIN CREDENTIALS] block below.

EXECUTE browser_navigate NOW.