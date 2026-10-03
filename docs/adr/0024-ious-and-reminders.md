# 0024. IOUs, split bills and reminders

- Status: Accepted
- Date: 2026-10-01

## Context

FR-L6 asks for money owed to or by a person. Splitting a shared bill is the
most common case: one payment, several people owing their share. Overdue
paybacks and bills are easy to forget without reminders.

## Decision

- People are free-text names (with autocomplete from earlier names), not
  contacts.
- An IOU is ledger-backed: lending posts to a per-currency **Receivables**
  system account, borrowing to **Payables**. A split bill is one entry: the
  user's share is an expense in its category; each other person's share is a
  receivable line naming them. Repayments post against the same accounts and
  name the IOU they settle. Postings still balance per currency.
- Money owed **to** the user lowers free money (the cash is gone) but is not
  spending: it never counts in "spent today" or in category reports. It is
  covered like any shortfall (ADR 0021), and a repayment refills in reverse.
- Money the user **owes** is reserved like a bill until paid, from the day it
  is recorded.
- An IOU may have a due date. After it, the user gets a reminder weekly until
  settled. After a configurable time, Allotr offers "Write off", which turns
  the remainder into an expense in a chosen category.
- **Reminders** (bills due, IOUs due or overdue, weekly review) appear in the
  app and, when the user opts in on a device, as Web Push notifications.
  Push goes through the browser vendor's push service, so it is off by
  default and listed in `docs/privacy.md` (ADR 0011). Chat gateway reminders
  come with the gateways.

## Consequences

- Two new system account roles and an `ious` table linking entries,
  people, due dates and settlements.
- Net worth adds receivables and subtracts payables.
- The server needs a scheduler job and VAPID keys (generated at first start,
  stored with other instance secrets).
