# Privacy

Allotr has no telemetry, analytics, crash reporting or install counting
([ADR 0011](adr/0011-no-telemetry.md)). A default install makes no
outbound requests. Each feature below makes one only after it is turned
on, and sends only what it needs.

## Outbound calls

| Feature | Turned on by | What leaves the server | Where it goes |
|---|---|---|---|
| Theme import from a URL | An admin: Settings → Instance → "Allow theme import from a URL" (off by default) | One HTTPS GET for the address a user gives, with no cookies or credentials | That address, only if it resolves to public IP addresses ([architecture](architecture.md#5-api)) |
| Web Push notifications (reminders) | A user, per device: Settings → App → Reminders → "Turn on notifications", after the browser asks for permission. Off by default; with no subscribed device the server sends nothing | One HTTPS POST per notification, encrypted for that browser, to the push endpoint the browser gave. It carries the reminder's title and text (for example a bill's name and amount), signed with the instance's VAPID key; no cookies, no account details | The browser vendor's push service named in the subscription (for example the one run by the browser's maker), only if it resolves to public IP addresses. The vendor sees that a notification was sent to that browser and its size, not the text |

The VAPID key pair is generated on the instance the first time it starts and
kept with the instance settings; the private key is never served. Reminders
themselves, and the in-app feed, are made on the server and need no outbound
call. A user can turn push off on a device at any time, which removes its
subscription from the server.

Adding an outbound call means adding a row here and an ADR.
