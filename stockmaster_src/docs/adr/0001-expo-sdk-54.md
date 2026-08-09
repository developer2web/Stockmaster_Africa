# ADR 0001 — Remain on Expo SDK 54

- Status: Accepted
- Date: 2026-07-25

## Decision

StockMaster remains on Expo SDK 54, React Native 0.81, React 19.1, and Node
20.19.x. Expo-managed packages must be installed with `npx expo install` and
validated with `npx expo-doctor`.

## Rationale

The current application and development client are built and tested on SDK 54.
SDK 57 targets React Native 0.86, React 19.2, and Node 22.13 or newer. That is a
platform migration rather than a routine dependency update.

## Consequences

- Feature work must use the versioned SDK 54 documentation.
- Automated dependency upgrades must not cross the SDK 54 compatibility range.
- A future SDK 57 migration requires its own branch, native rebuilds, database
  regression tests, and Android, iOS, and web acceptance testing.
