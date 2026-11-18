variable "name" {
  description = "Nombre del servicio de Cloud Run."
  type        = string
}

variable "region" {
  description = "Región del servicio."
  type        = string
}

variable "image" {
  description = "Imagen a desplegar (con tag del commit)."
  type        = string
}

variable "bucket_name" {
  description = "Bucket donde se suben las fotos."
  type        = string
}

variable "max_instances" {
  description = "Tope de instancias. Bajo para que nunca se dispare el costo."
  type        = number
  default     = 2
  validation {
    condition     = var.max_instances >= 1 && var.max_instances <= 5
    error_message = "Entre 1 y 5."
  }
}

variable "labels" {
  description = "Etiquetas obligatorias."
  type        = map(string)
}

# Identidad propia del contenedor (no la default de Compute, que es editor).
resource "google_service_account" "app" {
  account_id   = "sa-${var.name}"
  display_name = "Runtime de ${var.name}"
}

# Menor privilegio: solo CREAR objetos y solo bajo uploads/.
resource "google_storage_bucket_iam_member" "app_uploads_only" {
  bucket = var.bucket_name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.app.email}"

  condition {
    title       = "solo-uploads"
    description = "Solo objetos con prefijo uploads/"
    expression  = "resource.name.startsWith(\"projects/_/buckets/${var.bucket_name}/objects/uploads/\")"
  }
}

# Para firmar URLs sin clave JSON: signBlob sobre sí misma.
resource "google_service_account_iam_member" "app_self_sign" {
  service_account_id = google_service_account.app.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.app.email}"
}

resource "google_cloud_run_v2_service" "this" {
  name                = var.name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  labels              = var.labels

  template {
    service_account = google_service_account.app.email
    labels          = var.labels

    scaling {
      min_instance_count = 0 # escala a cero: sin tráfico, sin costo
      max_instance_count = var.max_instances
    }

    containers {
      image = var.image
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true # CPU solo mientras atiende requests
      }
      env {
        name  = "BUCKET_NAME"
        value = var.bucket_name
      }
      startup_probe {
        http_get {
          path = "/health"
        }
      }
    }
  }
}

# Portal público (los asegurados no tienen cuenta de Google).
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.this.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "url" {
  value = google_cloud_run_v2_service.this.uri
}

output "service_name" {
  value = google_cloud_run_v2_service.this.name
}

output "service_account" {
  value = google_service_account.app.email
}
