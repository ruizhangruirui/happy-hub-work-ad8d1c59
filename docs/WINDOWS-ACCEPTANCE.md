# Windows Outlook Acceptance

Do not mark full Outlook integration validated until this checklist is completed on the target corporate workstation.

## Classic Outlook

- [ ] Helper builds/publishes and starts at login
- [ ] `/v1/health` reports Classic Outlook and attachments available
- [ ] Full Integration is detected from the Production origin
- [ ] To, Subject and Body are correct
- [ ] Template attachment appears
- [ ] Additional attachment appears
- [ ] Outlook displays a draft and does not send
- [ ] User manually sends in Outlook
- [ ] Mark Sent updates Communication History
- [ ] Linked Email Task completes only after Mark Sent

## New Outlook

- [ ] Helper/web app falls back without crash
- [ ] User receives the attachment warning
- [ ] `mailto:` draft contains To/Subject/Body
- [ ] Attachments are added manually
- [ ] Mark Sent semantics remain correct

Record Windows version, Outlook mode/version, helper version, application commit, tester and date as release evidence.
