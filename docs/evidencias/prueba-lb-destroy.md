# Prueba del load balancer y del destroy (18/11/2026)

| Paso | Qué se hizo | Tiempo |
|---|---|---|
| 1 | `ENABLE_LB=true` + Deploy (crea serverless NEG, backend, URL map, proxy y forwarding rule) | 2 min 59 s |
| — | Primer `200` en `http://<IP>/healthz` (por el LB; ver nota al final) | ~1 min después del deploy |
| 2 | `ENABLE_LB=false` + Deploy (borra el LB) | 2 min 29 s |
| 3 | Destroy completo → `Total: 0` recursos en el state | 36 s |
| 4 | Redeploy desde cero | 1 min 45 s |

**Total de punta a punta:** ~8 minutos.

## Conclusiones para el día de la defensa
- El LB se prende en ~3 minutos y responde casi enseguida, así que alcanza con prenderlo 30 minutos antes.
- Volver a levantar todo desde cero tarda menos de 2 minutos: si algo se rompe en la demo, hay plan B rápido.
- El LB estuvo prendido ~10 minutos: costo de centavos.

## Evidencias
- `lb-subida-ok.png`: subida de una foto entrando por la IP del load balancer (34.111.197.83).
- `destroy-total-0.png`: resumen del workflow Destroy con 0 recursos restantes.
- `actions-historial.png`: historial de ejecuciones (deploys, destroy y redeploy).

## Nota sobre `/healthz`
Cloud Run reserva las rutas que terminan en "z": por la URL `run.app`, `/healthz` devuelve 404 sin llegar al contenedor (por el load balancer sí funcionaba). El 18/11 se renombró el endpoint a `/health`.
