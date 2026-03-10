# Build Frontend Feature

Builds a complete, tested Ember.js 6.4 feature for AALA.LAND.

## Usage
```
/build-feature <feature-name> [spec]
```

## What This Does

1. Delegates to the `frontend-feature` agent with the feature name and spec
2. Agent creates: route, controller (if needed), model, components, templates, unit tests, integration tests
3. Agent adds route to router.js
4. Agent runs tests and confirms they pass
5. Agent confirms build is clean
6. Delegates to `code-auditor` for frontend checks (data-test attributes, no inline styles)
7. Reports final status

## Examples

```
/build-feature auth "login and logout flows with JWT token storage"
/build-feature property-list "paginated property list with search and filter"
/build-feature lead-kanban "drag-and-drop lead pipeline with columns: NEW, CONTACTED, VIEWING, NEGOTIATING, WON, LOST"
/build-feature boss-dashboard "real-time KPIs: active leads, revenue, agent performance"
```

## Failure Policy

If tests fail or audit finds issues, the feature is NOT marked complete. Report blockers clearly.
