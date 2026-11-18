# Hallazgos de seguridad — Checkov

Fuente: job `terraform` del CI en el PR #1 (Checkov 3.4.5, `directory: infra`, `soft_fail: true`).
Resultado: **50 checks pasados, 8 fallidos, 0 omitidos.**

## Hallazgos

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

## Lo que sí pasa (relevante para el diagrama)

- Buckets con Public Access Prevention `enforced` y uniform bucket-level access (CKV_GCP_114, CKV_GCP_29).
- Ningún binding público sobre el bucket (CKV_GCP_28). La SA de la app tiene `objectCreator` condicionado al prefijo `uploads/`.
- Sin roles básicos (Owner/Editor/Viewer) a nivel proyecto (CKV_GCP_117) y sin uso de la SA por defecto (CKV_GCP_46).

## Resumen

Los hallazgos 1 a 4 son trade-offs de costo aceptados para un entorno de demo. Los 5 a 8 son permisos de la SA de CI más amplios de lo necesario. No bloquean, pero son la mejora de seguridad más concreta para una v2.
