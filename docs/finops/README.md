# FinOps · Cloud Storage en us-central1

Planilla: [`planilla-finops-cloud-storage.xlsx`](planilla-finops-cloud-storage.xlsx), exportada de Google Sheets.

**Escenario:** entra 1 TiB nuevo por mes durante 12 meses. Se compara todo en Standard contra la regla de lifecycle del bucket (30 días → Coldline, 365 días → Archive).

| | USD (12 meses) |
|---|---|
| Todo en Standard | 1.597,44 |
| Con lifecycle | 592,99 |
| **Ahorro** | **1.004,45 (62,9 %)** |

## Precios usados (USD por GiB-mes, us-central1)

| Standard | Nearline | Coldline | Archive |
|---|---|---|---|
| 0,020 | 0,010 | 0,004 | 0,0012 |

Fuente: <https://cloud.google.com/storage/pricing>, consultada el 18/11/2026. Google publica el precio por GiB-hora y lo pasamos a mes con 730 h.

## Supuestos

- 1 TiB = 1.024 GiB (1 TB decimal son unos 931 GiB).
- Granularidad mensual de 30 días, el mismo divisor para Coldline y para Archive.
- Objetos de 3 MB en promedio (una foto de celular). Las transiciones de lifecycle se cobran como operación Class A de la clase destino, unos USD 77 en el año.
- Las transiciones de lifecycle no tienen cargo por borrado anticipado.
- En 12 meses nada llega a Archive: el primer TiB cumple 365 días en el mes 13.
- No se incluyen escrituras de ingreso, egreso ni free tier, porque son iguales en los dos escenarios o despreciables.
- Se asume que los datos no se leen después de pasar a Coldline. Leerlos cuesta USD 0,02 por GiB.
