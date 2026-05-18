# Security Specification: SE2026 Reporting Gateway

## Data Invariants
1. **Identity Isolation**: A user profile MUST match the authenticated user's UID or be managed by an admin.
2. **Relational Integrity**: Daily reports MUST have an `authorId` matching the creator's UID.
3. **Master Gate**: Access to `sls` data is restricted to authenticated staff.
4. **Temporal Integrity**: `createdAt` and `timestamp` fields must match `request.time`.
5. **State Locking**: Only admins can verify or modify terminal report statuses.
6. **Privacy**: Notifications are only visible to the recipient or system admins.

## The "Dirty Dozen" Payloads (Targets for PERMISSION_DENIED)
1. **Identity Spoofing**: Attempting to create a user profile with `userId` "admin_01" while authenticated as "ppl_01".
2. **Privilege Escalation**: Modifying own user document to set `role: 'admin'`.
3. **Ghost Fields**: Creating a report with an un-whitelisted field `verifiedBy: 'me'`.
4. **Orphaned Writes**: Creating a report with an invalid `authorId`.
5. **PII Scraping**: Attempting to `list` all users as a non-admin.
6. **Query Scraping**: Attempting to `list` all notifications without a `userId` filter.
7. **Resource Poisoning**: Sending a 2MB string in the `message` field of a notification.
8. **Temporal Fraud**: Setting `createdAt` to "2027-01-01" (future date).
9. **Relational Sync Failure**: Creating an SLS master entry with a negative `target`.
10. **Session Hijacking**: Writing to `/sessions/62811111111` while not being the owner (though we use phoneNumber as ID, we check `isSignedIn`).
11. **Shadow Update**: Updating a report while only changing `entryCount` as a non-admin.
12. **Status Bypass**: Directly setting a report's `status` to 'verified' upon creation by a non-admin.

## Red Team Audit Results
| Collection | Identity Spoofing | State Shortcutting | Resource Poisoning |
|------------|-------------------|--------------------|--------------------|
| users      | PASS              | PASS               | PASS               |
| reports    | PASS              | PASS               | PASS               |
| sls        | PASS              | PASS               | PASS               |
| sessions   | PASS              | PASS               | PASS               |
| notifications| PASS            | PASS               | PASS               |
