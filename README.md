# Floorball Platform

Webapp til floorball (dansk UI) for **admin**, **ledere**, **spillere** og **supportere**.

## Kom i gang (Windows PowerShell)

```powershell
Set-Location "c:\Users\larss\OneDrive\Apps\Turneringsadministration"
npm.cmd install
npm.cmd run dev
```

Åbn `http://localhost:3000`.

## Standard data (seed)

Seed opretter:
- Teams: “U19 herrelandsholdet” og “U17 herrelandsholdet”
- Admin-bruger (fra `.env`): `ADMIN_EMAIL` + `ADMIN_PASSWORD`

Kør seed manuelt:

```powershell
Set-Location "c:\Users\larss\OneDrive\Apps\Turneringsadministration"
npx.cmd prisma db seed
```

## Public API (eksterne services)

Read-only endpoints som andre apps kan kalde (fx streaming overlays eller Flashscore-integration).

### Authentication (valgfri)

Som default er public API åbent.
Hvis du vil kræve API-key, så sæt `PUBLIC_API_KEYS` i miljøet (kommasepareret).

- `PUBLIC_API_KEYS=key1,key2`
	- Sendes som `x-api-key: key1` (eller `Authorization: Bearer key1`, eller `?key=key1`).

### CORS (valgfri)

Som default tillades alle origins.
Hvis du vil begrænse, sæt `PUBLIC_API_ALLOWED_ORIGINS` (kommasepareret).

- `PUBLIC_API_ALLOWED_ORIGINS=https://example.com,https://streaming.example`

### Endpoints

- `GET /api/public/kampprogram`
	- Query: `league`, `pool`, `stage`, `gender`, `season=yyyy-yyyy` (eller legacy `seasonStartYear`), `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, `includeLive=1`, `referee`, `refereeId`, `team`, `teamId`
	- Returnerer kampprogram med `season` (format `yyyy-yyyy`), `gender`, `referee1/2` og `result` (tilføjer `(SV)` hvis protokol viser afgørelse i OT).

- `GET /api/public/match/:kampId`
	- Query: `includeEvents=1`
	- Returnerer kamp-meta, live score og holdopstillinger (protokol foretrækkes).
	- Ved `includeEvents=1` returneres events som `events` (upload-events: mål, udvisninger, time-outs, straffeslag) med `player1` og evt. `player2`.

## Flow

- Opret bruger: `/opret-bruger` (Hold, Rolle, Email, Brugernavn, Kodeord)
- Leder-brugere: afventer **admin**-godkendelse
- Spiller/supporter: afventer **leder**-godkendelse
- Login: `/login`

## Sider

Tomme (klar til senere indhold):
- `/statistik`, `/test`, `/playbook`, `/oevelser`, `/video`, `/skemaer`

Godkendelser:
- Admin: `/admin`
- Leder: `/leder`
