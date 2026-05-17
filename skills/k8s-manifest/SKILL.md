---
name: k8s-manifest
description: Write, review, or debug Kubernetes manifests / Helm / Kustomize — resources, probes, limits, security context, and safe rollout. Use when authoring K8s YAML or diagnosing a workload that won't run.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; Kubernetes API conventions (public) — no text reused
---

# Kubernetes Manifests

K8s YAML is easy to write and easy to get subtly, dangerously wrong. Apply the
production checklist.

## 1. Match the project

Plain manifests vs **Helm** vs **Kustomize**; the target K8s version (API
versions move); existing conventions (labels, namespaces, naming). Follow them.
`$ARGUMENTS` is the workload/task.

## 2. Get the production essentials right

- **Health**: `readinessProbe` (gate traffic) **and** `livenessProbe`
  (restart) — distinct purposes; a missing readiness probe causes traffic to
  hit a not-ready pod.
- **Resources**: `requests` and `limits` for CPU/memory on every container.
  No memory limit ⇒ node OOM risk; no requests ⇒ bad scheduling. (Be cautious
  with CPU limits/throttling.)
- **Rollout**: `Deployment` with `RollingUpdate` (sane maxUnavailable/maxSurge),
  `replicas` ≥ 2 for availability, `PodDisruptionBudget` for voluntary
  disruptions.
- **Security**: non-root (`runAsNonRoot`, `runAsUser`),
  `readOnlyRootFilesystem`, drop capabilities, `seccompProfile`, no privileged;
  least-privilege RBAC; secrets via `Secret`/external secret store, **never** in
  env literals or the image.
- **Config**: `ConfigMap`/`Secret` not hardcoded; image pinned by digest/tag,
  `imagePullPolicy` sane; `terminationGracePeriod` + graceful shutdown.
- Labels/selectors consistent; namespace set; `NetworkPolicy` if the cluster
  uses them.

## 3. Debug a broken workload

`kubectl get/describe pod`, events, and `logs` (+ `--previous` for crashloops).
Map the symptom: `ImagePullBackOff` (image/registry/secret), `CrashLoopBackOff`
(app error/bad probe/config), `Pending` (resources/affinity/PVC),
`OOMKilled` (memory limit), readiness failing (probe path/port). Fix the cause.

## 4. Verify safely

`kubectl apply --dry-run=server` + `kubeconform`/`kubeval`; `helm template`/
`kustomize build` and inspect rendered output. Do **not** apply to a real
cluster autonomously — hand the user the manifests and the apply command;
flag anything that deletes/replaces a stateful resource (PVC, StatefulSet) as
data-loss risk. Report the rendered diff and the rollout/rollback commands.
