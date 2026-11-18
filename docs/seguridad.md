# Hallazgos de seguridad

## 1. Checkov (Terraform)

Fuente: job `terraform` del CI en el PR #1 (Checkov 3.4.5, `directory: infra`, `soft_fail: true`).
Resultado: **50 checks pasados, 8 fallidos, 0 omitidos.**

### Hallazgos

| # | Check | Recurso | Qué pide | Decisión propuesta |
|---|-------|---------|----------|--------------------|
| 1 | CKV_GCP_62 | `module.bucket.google_storage_bucket.this` (`infra/modules/bucket/main.tf`) | Access logs del bucket de fotos | **Aceptado para la demo.** Los usage logs de GCS se guardan en otro bucket y suman costo y recursos. La trazabilidad mínima la dan los logs de la app (`signed_url_issued` con `objectName`). Para producción: habilitar Data Access audit logs de Cloud Storage. |
| 2 | CKV_GCP_62 | `google_storage_bucket.tfstate` (`infra/bootstrap/main.tf`) | Access logs del bucket de state | **Aceptado.** Mismo motivo. El bucket es privado (PAP enforced + UBLA) y solo la SA de CI tiene acceso. |
| 3 | CKV_GCP_78 | `module.bucket.google_storage_bucket.this` | Versionado del bucket de fotos | **Aceptado.** Con versionado, las reglas de borrado (TTL de 7 d de `uploads/test-*` y `uploads/sin-numero/`) dejan versiones no actuales que siguen ocupando espacio. La app nunca sobrescribe objetos: cada nombre lleva timestamp + UUID. |
| 4 | CKV_GCP_84 | `module.registry.google_artifact_registry_repository.this` (`infra/modules/registry/main.tf`) | Cifrado con claves propias (CMEK/CSEK) | **Aceptado.** Se usan claves administradas por Google. CMEK requiere Cloud KMS, que cobra por clave y por operación y no entra en el objetivo de costo USD 0. |
| 5 | CKV_GCP_125 | `google_iam_workload_identity_pool_provider.github` (`infra/bootstrap/main.tf`) | Trust policy de OIDC más restringida | **Pendiente.** Hoy el `attribute_condition` filtra solo por repositorio, así que cualquier rama o PR del repo puede obtener credenciales. Mejora posible: agregar condición por `assertion.ref` o `assertion.environment`. Ojo: `ci.yml` también se autentica en los PR para correr el `plan`, así que restringir a `main` rompería el CI. Habría que separar dos SA (una de solo lectura para el plan y otra para el apply). |
| 6 | CKV_GCP_49 | `google_project_iam_member.ci_roles["roles/iam.serviceAccountAdmin"]` | La SA de CI no debería administrar SAs a nivel proyecto | **Pendiente.** Terraform crea la SA de la app, por eso lo necesita. Mejora: crear la SA de la app en el bootstrap y sacarle este rol a CI, o darlo solo sobre esa SA. |
| 7 | CKV_GCP_49 | `google_project_iam_member.ci_roles["roles/iam.serviceAccountUser"]` | Ídem: puede actuar como cualquier SA del proyecto | **Pendiente.** Hace falta para desplegar Cloud Run con la SA de la app. Mejora: otorgar `serviceAccountUser` solo sobre la SA de la app (`google_service_account_iam_member`) en vez de a nivel proyecto. |
| 8 | CKV_GCP_41 | `google_project_iam_member.ci_roles["roles/iam.serviceAccountUser"]` | No asignar Service Account User a nivel proyecto | **Pendiente.** Se corrige con el mismo cambio que el #7. |

### Lo que sí pasa (relevante para el diagrama)

- Buckets con Public Access Prevention `enforced` y uniform bucket-level access (CKV_GCP_114, CKV_GCP_29).
- Ningún binding público sobre el bucket (CKV_GCP_28). La SA de la app tiene `objectCreator` condicionado al prefijo `uploads/`.
- Sin roles básicos (Owner/Editor/Viewer) a nivel proyecto (CKV_GCP_117) y sin uso de la SA por defecto (CKV_GCP_46).

### Resumen

Los hallazgos 1 a 4 son trade-offs de costo aceptados para un entorno de demo. Los 5 a 8 son permisos de la SA de CI más amplios de lo necesario. No bloquean, pero son la mejora de seguridad más concreta para una v2.

## 2. Cadena de suministro del CI: `aquasecurity/trivy-action`

| Campo | Detalle |
|-------|---------|
| Componente | `.github/workflows/ci.yml`, job `image`, paso Trivy |
| Problema | El action se referenciaba por etiqueta mutable (`@0.28.0`). El 19/03/2026 un atacante reescribió con force-push 76 de las 77 etiquetas de `aquasecurity/trivy-action` (versiones 0.0.1 a 0.34.2) para que apuntaran a un ladrón de credenciales que corría dentro del runner. Está registrado como CVE-2026-33634 (crítico, GHSA-69fq-xp46-6x23). Las etiquetas se remediaron en unas 12 h y ahora se publican con prefijo `v`, así que `@0.28.0` dejó de resolver y el job `image` fallaba en "Set up job". |
| Exposición en este repo | **Ninguna.** El workflow se creó después del incidente y la etiqueta nunca resolvió, así que el action no llegó a ejecutarse en ningún run. |
| Riesgo | Con una etiqueta mutable, quien controle el repo del action puede cambiar el código que corre en nuestro CI. Ese job tiene `GITHUB_TOKEN` y, en el job de Terraform, credenciales de GCP por WIF. |
| Mitigación | **Resuelto** en `main` (9d4beb4): el action quedó fijado por SHA a `57a97c7e7821a5776cebc9bb87c984fa69cba8f1` (v0.35.0, primera versión limpia). Verificado que el SHA coincide con la etiqueta `v0.35.0` publicada. |
| Pendiente | El resto de los actions (`actions/checkout@v4`, `hashicorp/setup-terraform@v3`, `google-github-actions/auth@v2`, `bridgecrewio/checkov-action@v12`, etc.) siguen referenciados por etiqueta. Fijarlos por SHA aplica la misma mitigación. Se puede sumar Dependabot para actualizar los SHA. |

## 3. Trivy (imagen del contenedor)

Fuente: job `image` del CI en el PR #1, antes del cambio de imagen base (Trivy v0.69.3, `severity: CRITICAL,HIGH`, `ignore-unfixed: true`).
Resultado: **7 vulnerabilidades (1 CRITICAL, 6 HIGH), todas en `libssl3`** de la imagen base `gcr.io/distroless/nodejs22-debian12:nonroot` (Debian 12.13). Las dependencias npm de la app (`node-pkg`) no tienen hallazgos.

| CVE | Severidad | Instalada | Corregida en |
|-----|-----------|-----------|--------------|
| CVE-2026-31789 | CRITICAL | 3.0.18-1~deb12u2 | 3.0.19-1~deb12u2 |
| CVE-2026-28387 | HIGH | 3.0.18-1~deb12u2 | 3.0.19-1~deb12u2 |
| CVE-2026-28388 | HIGH | 3.0.18-1~deb12u2 | 3.0.19-1~deb12u2 |
| CVE-2026-28389 | HIGH | 3.0.18-1~deb12u2 | 3.0.19-1~deb12u2 |
| CVE-2026-28390 | HIGH | 3.0.18-1~deb12u2 | 3.0.19-1~deb12u2 |
| CVE-2026-45447 | HIGH | 3.0.18-1~deb12u2 | 3.0.20-1~deb12u2 |
| CVE-2026-84782 | HIGH | 3.0.18-1~deb12u2 | 3.0.22-1~deb12u2 |

**Estado: resuelto** en `main` (a6650b0). La imagen base pasó a `gcr.io/distroless/nodejs22-debian13:nonroot`. Al volver a correr el CI en el PR #1, Trivy reporta **0 vulnerabilidades** en `quantumquack:ci (debian 13.7)`.
