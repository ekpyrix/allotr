# Privacy

Allotr has no telemetry, analytics, crash reporting or install counting
([ADR 0011](adr/0011-no-telemetry.md)). A default install makes no
outbound requests. Each feature below makes one only after it is turned
on, and sends only what it needs.

## Outbound calls

| Feature | Turned on by | What leaves the server | Where it goes |
|---|---|---|---|
| Theme import from a URL | An admin: Settings → Instance → "Allow theme import from a URL" (off by default) | One HTTPS GET for the address a user gives, with no cookies or credentials | That address, only if it resolves to public IP addresses ([architecture](architecture.md#5-api)) |

Adding an outbound call means adding a row here and an ADR.
