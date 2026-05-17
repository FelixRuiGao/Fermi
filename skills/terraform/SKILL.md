---
name: terraform
description: Write or review Infrastructure-as-Code (Terraform/OpenTofu, and similar) — modules, state, variables, security, and a safe plan-before-apply workflow. Use when authoring or reviewing IaC.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; Terraform/IaC best-practice principles (no text reused)
---

# Terraform / IaC

Infrastructure code provisions real, billable, sometimes irreversible
resources. Correctness and a safe workflow matter more than elegance.

## 1. Understand the project's setup

Provider(s), Terraform/OpenTofu version, **state backend** (remote + locking?),
module layout, workspaces/environments, naming conventions. Read existing
modules and match them. `$ARGUMENTS` is the task.

## 2. Author well

- **Modules**: reusable, with typed `variable`s (description, type,
  validation, sensible defaults) and meaningful `output`s. Don't hardcode
  account IDs/regions/secrets.
- **State**: never commit `.tfstate` or `.tfvars` with secrets; assume remote
  state with locking; never edit state by hand (use `terraform state mv/rm`).
- **Secrets**: from a secret manager / env, never plaintext in `.tf`/vars; mark
  sensitive outputs `sensitive = true`.
- **Pin** provider and module versions; `terraform fmt` + `validate`.
- Least-privilege IAM/security groups; encryption on by default; tagging.
- `for_each` over `count` for stable addressing; explicit `depends_on` only when
  needed.

## 3. The workflow is the safety mechanism

- `terraform fmt -check`, `validate`, then **`terraform plan`** — always read
  the plan. The plan is the contract.
- **Flag destructive plan output loudly**: any `destroy`/`replace`/forced
  recreation of stateful resources (DB, volume, bucket) is potential data loss.
  Call it out explicitly; never `apply` such a plan without the user's explicit
  go-ahead.
- **Do not run `terraform apply`** against real infrastructure autonomously —
  produce the plan and hand it to the user to apply. Apply is a high-blast-
  radius, often irreversible, shared action.
- Recommend `tfsec`/`checkov`/`terraform-compliance` for a security scan if
  available.

## 4. Verify

`validate` + `plan` clean and reviewed; the diff matches intent; no secrets in
code/state; no unintended destroy. Report the plan summary (add/change/destroy
counts), the destructive items if any, and the exact apply command for the user.
