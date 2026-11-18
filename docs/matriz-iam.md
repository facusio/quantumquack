# Matriz IAM

Proyecto: `quantumquack-ucu`. Fuentes: `infra/bootstrap/main.tf` (CI y WIF) y `infra/modules/container_service/main.tf` (app).

Principio: cada identidad tiene solo lo que necesita para su tarea. Ninguna identidad automatizada usa roles básicos (Owner/Editor/Viewer), y la app no usa la SA por defecto de Compute (que tiene Editor).

## Matriz

| Identidad | Permiso | Recurso | Por qué |
|-----------|---------|---------|---------|
| **Facundo** (cuenta personal) | `roles/owner` | Proyecto | Abrió el proyecto y corrió el bootstrap a mano. El bootstrap crea la SA de CI, WIF y le asigna roles a CI, así que hace falta alguien con permisos de IAM sobre el proyecto. Después de eso, los cambios van por Terraform + PR. |
| **Gastón** (cuenta personal) | `roles/viewer` | Proyecto | Ver recursos, logs y métricas para revisar y depurar. No puede cambiar nada: todo cambio pasa por PR → CI → aprobación → `terraform apply`. |
| **Luca** (cuenta personal) | `roles/viewer` | Proyecto | Ídem Gastón. |
| **SA de la app** `sa-quantumquack-dev` | `roles/storage.objectCreator` con condición `resource.name.startsWith(".../objects/uploads/")` | Bucket de fotos (`*-quantumquack-dev-claims`) | La URL firmada se emite en nombre de esta SA, así que la SA tiene que poder crear el objeto. Solo **crear** (no leer, listar ni borrar) y solo bajo `uploads/`. |
| **SA de la app** | `roles/iam.serviceAccountTokenCreator` | Ella misma (no el proyecto) | Permite llamar a `signBlob` para firmar las URL V4 sin descargar una clave JSON. Está acotado a sí misma, así que no puede firmar ni emitir tokens como otra SA. |
| **SA de CI** `sa-ci-github` | `roles/iam.workloadIdentityUser` | SA de CI | Permite que GitHub Actions la impersone vía WIF. El miembro es `principalSet://.../attribute.repository/<owner/repo>`: solo el repo del equipo. |
| **SA de CI** | `roles/run.admin` | Proyecto | Crear y actualizar el servicio de Cloud Run y su binding `run.invoker`. |
| **SA de CI** | `roles/artifactregistry.admin` | Proyecto | Crear el repositorio de imágenes, su política de limpieza (últimas 3) y hacer push. |
| **SA de CI** | `roles/storage.admin` | Proyecto | Crear el bucket de fotos con su ciclo de vida, CORS y bindings, y leer/escribir el state de Terraform. |
| **SA de CI** | `roles/iam.serviceAccountAdmin` | Proyecto | Crear la SA de la app y asignarle el binding de `serviceAccountTokenCreator` sobre sí misma. |
| **SA de CI** | `roles/iam.serviceAccountUser` | Proyecto | Desplegar Cloud Run "actuando como" la SA de la app (`actAs`). |
| **SA de CI** | `roles/monitoring.editor` | Proyecto | Dashboard, políticas de alerta y canales de notificación. |
| **SA de CI** | `roles/logging.configWriter` | Proyecto | Configurar la retención de logs (7 días). |
| **SA de CI** | `roles/compute.loadBalancerAdmin` | Proyecto | Crear y borrar el load balancer opcional (NEG, backend, URL map, proxy, forwarding rule). |
| **SA de CI** | `roles/serviceusage.serviceUsageConsumer` | Proyecto | Consumir las APIs habilitadas en nombre del proyecto. |
| **`allUsers`** | `roles/run.invoker` | Servicio de Cloud Run | El portal es público: los asegurados no tienen cuenta de Google. No le da acceso a nada más que al endpoint HTTP. Las fotos solo se pueden escribir con una URL firmada de 5 minutos. |

## Workload Identity Federation: solo el repo del equipo

- Pool `github-pool`, proveedor `github-oidc` con issuer `https://token.actions.githubusercontent.com`.
- Doble filtro por repositorio:
  1. **Proveedor:** `attribute_condition = assertion.repository == "<owner/repo>"`. GCP rechaza tokens de cualquier otro repo antes de emitir credenciales.
  2. **SA de CI:** el binding `workloadIdentityUser` es solo para `attribute.repository/<owner/repo>`.
- No existen claves JSON de larga duración: GitHub pide un token OIDC por run y GCP lo cambia por credenciales temporales.

## Por qué la app y CI no usan Editor

- **Editor** da escritura sobre casi todos los servicios del proyecto. Si alguien comprometiera la app (por ejemplo, con una vulnerabilidad en Express), podría borrar buckets, leer todas las fotos o crear recursos que generen costo. Con la matriz de arriba, lo único que puede hacer es crear objetos en `uploads/`.
- En CI, Editor tampoco alcanza: no permite asignar roles de IAM, y Terraform los necesita para los bindings de la app. La alternativa sería Owner, que es todavía más amplio. Por eso se usan roles predefinidos, uno por servicio.

## Mejoras pendientes

Detalladas en [`seguridad.md`](seguridad.md) (hallazgos 5 a 8 de Checkov):

- `serviceAccountUser` y `serviceAccountAdmin` están a nivel proyecto. Se pueden bajar a la SA de la app (`google_service_account_iam_member`).
- WIF filtra por repo, pero no por rama ni environment. Cualquier PR del repo puede obtener las credenciales de CI. Separar una SA de solo lectura para `plan` y otra para `apply` (solo `main`/`dev`) cerraría ese hueco.
- Los admin de Run/Artifact Registry/Storage son amplios. Se podrían reemplazar por roles custom con solo los permisos que usa Terraform.
