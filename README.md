# WemX to Cloudflare - Domain Manager (Node.js)

Small Express service to **allocate** and **reclaim** SRV DNS names on Cloudflare for game servers.  
Prefixes are drawn from `strings.txt` (one per line). When you create a domain, the chosen prefix is **removed** from the file. When you remove a domain, the prefix is **added back**.

---

## Features
- Create SRV records in your Cloudflare zone under a fixed domain suffix
- Optional service prefix for SRV names (currently supports `minecraft` → `_minecraft._tcp.`)
- Prefix pool managed via `strings.txt` (each prefix used once until reclaimed)
- Simple header auth with a shared secret

---

## Requirements
- Node.js 16+ (LTS recommended)
- A Cloudflare API token with **Zone:DNS Edit** for the target zone
- Your Cloudflare **Zone ID**

---

## Installation

### Directly
```bash
git clone https://github.com/NoobKeksTV/WemxToCloudflare.git
cd WemxToCloudflare
npm install express request dotenv
node index.js
```

### docker-compose

```bash
git clone https://github.com/NoobKeksTV/WemxToCloudflare.git
cd WemxToCloudflare/Dockerized
docker-compose up-d
```
The server listens on `http://localhost:${APIPort}` (default `9765`).

---

## Configuration (`.env`)
```ini
# Server
APIPort=9765

# Simple header auth (exact match; no "Bearer" etc.)
APISecret=your_super_secret

# Cloudflare
CFZoneID=your_cloudflare_zone_id
CFAuthKey=your_cloudflare_api_token

# Domain suffix used when creating & deleting a domain
# e.g. ".google.de"
DomainSuffix=.domain.com
```

---

## Prefix Pool (`strings.txt`)
Place a `strings.txt` file next to your script (`index.js`).  
One prefix per line, e.g.:
```
alpha
bravo
charlie
delta
```
- On **create**, a random prefix is picked and removed from `strings.txt`.
- On **remove**, the corresponding prefix is added back to `strings.txt` (only once).

---

## Authentication
Every endpoint requires the header:
```
Authorization: <APISecret>
```
It must match your `.env` value **exactly** (no `Bearer` scheme).

---
## Supported Service Names
| Service     | Service Prefix   | 
|-----------|--------|
| minecraft | _minecraft._tcp. |
| sinusbot | _http._tcp.|
| nginx | _http._tcp. |
| teamspeak3 | _ts3._udp.|
| nodejs | _http._tcp.|

---

## Endpoints

### 1) `POST /getAndCreateDomain`
Creates an SRV DNS record in your Cloudflare zone using a random prefix from `strings.txt`.

**Headers**
- `Authorization: <APISecret>`
- `Content-Type: application/json`

**Body (JSON)**
| Field     | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `service` | string | no       | Which Service the SRV record is. Example `minecraft` |
| `ogTarget`| string | yes      | SRV target FQDN, e.g. `mc.backend.example.com`. |
| `ogPort`  | number | yes      | SRV target port, e.g. `25565`. |
| `comment`  | string | no      | What comment to add to the SRV record? |

**Behavior**
1. Selects a random prefix from `strings.txt` and removes it from the file.
2. Builds the SRV name:  
   ```
   <servicePrefix><prefix><DomainSuffix>
   ```
   
   Example:
   ```
   _minecraft._tcp.golden-squad.egopvp-hosting.com
   ```
   where `<servicePrefix>` is `_minecraft._tcp.`, `<prefix>` is `golden-squad` and `<DomainSuffix>` is `.egopvp-hosting.com` 
3. Creates the SRV record on Cloudflare with the given target/port.

**Response**
- `200 OK` — returns the allocated hostname (plain text), e.g. `charlie.egopvp-hosting.com`
- `401 Unauthorized` — wrong/missing auth
- `415 Unsupported Media Type` — missing JSON
- `500` — no prefixes available
- `400` — Cloudflare error while creating

**Example (curl)**
```bash
curl -s -X POST "http://localhost:9765/getAndCreateDomain"   -H "Authorization: your_super_secret"   -H "Content-Type: application/json"   -d '{
    "service": "minecraft",
    "ogTarget": "mc.backend.example.com",
    "ogPort": 25565
  }'
# → e.g. charlie.egopvp-hosting.com
```

---

### 2) `POST /removeDomain`
Deletes the SRV DNS record and returns the **prefix** to `strings.txt`.

**Headers**
- `Authorization: <APISecret>`
- `Content-Type: application/json`

**Body (JSON)**
| Field       | Type   | Required | Description |
|-------------|--------|----------|-------------|
| `oldDomain` | string | yes      | The domain you want to remove. (e.g. `charlie.egopvp-hosting.com`) |
| `service`   | string | no       | Same semantics as in create: `"minecraft"` uses `_minecraft._tcp.`, otherwise no prefix. Needed to search the SRV Record on CloudFlare. |

**Behavior**
1. Normalizes `oldDomain`:
   - Strips it from `DomainSuffix` to get the **prefix**.
   - If it starts with the service prefix (e.g. `_minecraft._tcp.`), strips that too so only the pure **prefix** remains.
2. Rebuilds the full SRV record name to match on Cloudflare:  
   ```
   <servicePrefix><prefix><DomainSuffix>
   ```
3. Finds and deletes all matching SRV records.
4. If at least one record was deleted, appends the **prefix** back to `strings.txt` (only if not already present).

**Response**
- `200 OK` — deleted; prefix returned to pool
- `401 Unauthorized` — wrong/missing auth
- `404 Not Found` — no SRV record matched
- `415 Unsupported Media Type` — missing JSON
- `500/502` — Cloudflare/network error

**Example (curl) – remove a Minecraft SRV**
```bash
# If you previously received "charlie.egopvp-hosting.com":
curl -s -X POST "http://localhost:9765/removeDomain"   -H "Authorization: your_super_secret"   -H "Content-Type: application/json"   -d '{
    "oldDomain": "charlie.egopvp-hosting.com",
    "service": "minecraft"
  }'
# → 200 if deleted; prefix "charlie" is added back to strings.txt
```
---

## Notes & Tips
- The auth header must equal `APISecret` **exactly** (no `Bearer`).
- Keep `strings.txt` filled to avoid `500 No Strings available` on creation.
- Ensure `DomainSuffix` in `.env` matches the suffix used for creation (`.egopvp-hosting.com` in your current code).
- Cloudflare token should be scoped minimally (Zone:DNS Edit on the specific zone) for Safety reasons.

---

## Troubleshooting
- **401 Unauthorized** — Missing or wrong `Authorization` header.
- **415 Unsupported Media Type** — Send `Content-Type: application/json` and valid JSON.
- **500 No Strings available** — `strings.txt` is empty; add prefixes (one per line).
- **404 on remove** — Check `DomainSuffix` and `service` so the computed SRV name matches exactly what was created.
- **Cloudflare errors** — Verify `CFZoneID`, `CFAuthKey` permissions, and record name/zone.

---
