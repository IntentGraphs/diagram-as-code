# Camunda export extensions (v1 tranche) — Design

## Purpose

Make `@bpm/export-xml` output **deployable to a Camunda 7 engine**, not only viewable in bpmn-js / Camunda Modeler / Signavio. Today's export is spec-compliant BPMN 2.0 with no `camunda:` attributes, so engines cannot bind service implementations or user-task forms.

This document records the **scope decision before implementation**, per roadmap item 6.

## v1 scope (ship)

The three deployment-blocking attributes named in the roadmap:

| DSL key | XML | Allowed on | Meaning |
|---|---|---|---|
| `camundaClass` | `camunda:class` | `serviceTask` | Java delegate class name |
| `camundaExpression` | `camunda:expression` | `serviceTask` | Unified Expression Language expression |
| `camundaFormKey` | `camunda:formKey` | `userTask` | Form identifier for the task |

**Mutual exclusion:** `camundaClass` and `camundaExpression` must not appear on the same service task (Camunda treats them as alternative implementation bindings). Parse error if both are set.

**Namespace:** `xmlns:camunda="http://camunda.org/schema/1.0/bpmn"` is emitted on `<bpmn2:definitions>` **only** when at least one node carries a Camunda extension. Diagrams with none of these keys produce **the same XML as before** (no `camunda` xmlns, no extra attributes).

## DSL surface

Opt-in keys in the **existing node `[...]` attribute block** (`docs/LANGUAGE.md` §5.4), same comma-separated `key: value` form as edge `[style, corner, from, to]`. Users who never write these keys see **zero grammar change**.

```
serviceTask "Charge card" as s1 [camundaClass: com.example.ChargeDelegate]
serviceTask "Compute tax" as s2 [camundaExpression: "${amount * 1.1}"]
userTask "Approve order" as u1 [camundaFormKey: "embedded:app:forms/approve.html"]
```

Values may be unquoted tokens or double-quoted strings. Quotes are required when the value contains a comma or leading/trailing space. Colons inside values (typical `formKey`) do not need quotes because the key/value split is the first colon.

Mixing with visual keys is allowed:

```
userTask "Approve" as u1 [label: inside, camundaFormKey: "embedded:app:forms/approve.html"]
```

Wrong host kind is a parse error (e.g. `camundaFormKey` on a `serviceTask`, `camundaClass` on a `userTask` or generic `task`).

## Out of scope (deferred)

- `camunda:delegateExpression`, `camunda:type` (external/connector), `camunda:topic`
- Async / job (`camunda:asyncBefore`, `camunda:asyncAfter`, exclusive, retries)
- User-task assignment (`camunda:assignee`, `candidateGroups`, `candidateUsers`)
- Start-event `camunda:formKey`
- Camunda 8 / Zeebe `zeebe:` namespace
- Changing `isExecutable` (stays `false` unless a later tranche targets engine deployment flags)

## Export gating

- No Camunda keys in the AST → XML identical to pre-change output.
- Camunda keys present → `xmlns:camunda` on definitions + attributes on the matching `bpmn2:serviceTask` / `bpmn2:userTask` element only.
- Layout/render unchanged — these attributes are export-only.

## Verification

- Existing `@bpm/export-xml` tests must pass unmodified (no-vendor-extension regression).
- New fixtures: one per attribute; bpmn-js import with **no warnings**; re-exported XML still contains the `camunda:` attribute values.
