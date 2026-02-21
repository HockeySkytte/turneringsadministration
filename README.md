# Floorball Platform

Webapp til floorball (dansk UI) for **admin**, **ledere**, **spillere** og **supportere**.

## Kom i gang (Windows PowerShell)

```powershell
Set-Location "c:\Users\larss\OneDrive\Apps\Floorball Platform\floorball-platform"
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
Set-Location "c:\Users\larss\OneDrive\Apps\Floorball Platform\floorball-platform"
npx.cmd prisma db seed
```

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
