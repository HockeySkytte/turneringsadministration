#!/usr/bin/env python
"""Export Sportssys kampprogram (Kalender) to CSV.

Fetches match schedules directly from Sportssys' public HTML pages and writes a CSV
containing:
    Sæson, KampID, Dato, Tid, Sted, Køn, Alder, Liga, Pulje, Hjemmehold, Udehold, Resultat, Dommer 1, Dommer 2

Resultat includes "SV" when Sportssys indicates shootout/extra-time.

Examples:
  python scripts/export_sportssys_kampprogram.py --season-start 2025 --gender MEN --age-group SENIOR --out kampe_2025_men_senior.csv
    python scripts/export_sportssys_kampprogram.py --season-start 2025 --all --out kampe_2025_alle.csv

Notes:
- This uses unauthenticated endpoints on https://floorballresultater.sportssys.dk.
- Output is written as UTF-8 with BOM by default (utf-8-sig) for Excel friendliness.
"""

from __future__ import annotations

import argparse
import csv
import dataclasses
import datetime as dt
import re
import sys
import time
from typing import Dict, Iterable, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

BASE = "https://floorballresultater.sportssys.dk/tms/Turneringer-og-resultater"

MATCH_INFO_URL = f"{BASE}/Kamp-Information.aspx?KampId={{kamp_id}}"


AGEGROUP_TO_DIVISION: Dict[str, str] = {
    "OLDIES": "1",
    "SENIOR": "2",
    "U21": "16",
    "U19": "3",
    "U17": "4",
    "U15": "5",
    "U13": "6",
    "U12": "19",
    "U11": "7",
    "U10": "18",
    "U9": "8",
    "U8": "17",
    "U7": "9",
    "U5": "10",
}

AGEGROUP_LABEL: Dict[str, str] = {
    "OLDIES": "Oldies",
    "SENIOR": "Senior",
    "U21": "U-21",
    "U19": "U-19",
    "U17": "U-17",
    "U15": "U-15",
    "U13": "U-13",
    "U12": "U-12",
    "U11": "U-11",
    "U10": "U-10",
    "U9": "U-9",
    "U8": "U-8",
    "U7": "U-7",
    "U5": "U-5",
}

GENDER_TO_SPORTSSYS = {"MEN": "1", "WOMEN": "2"}  # 1=Mand, 2=Kvinde
GENDER_LABEL = {"MEN": "Mænd", "WOMEN": "Damer"}


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("\xa0", " ")).strip()


def _current_season_start_year(now: Optional[dt.datetime] = None) -> int:
    now = now or dt.datetime.now()
    return now.year if now.month >= 7 else now.year - 1


@dataclasses.dataclass(frozen=True)
class SeasonOption:
    value: str
    start_year: Optional[int]
    label: str


def get_season_options(session: requests.Session) -> List[SeasonOption]:
    url = f"{BASE}/Soegning.aspx"
    res = session.get(url, headers={"accept": "text/html"}, timeout=60)
    res.raise_for_status()

    soup = BeautifulSoup(res.text, "html.parser")
    sel = soup.select_one("select[name='ctl00$ContentPlaceHolder1$Soegning$ddlSeason']")
    if not sel:
        return []

    options: List[SeasonOption] = []
    for opt in sel.select("option"):
        value = (opt.get("value") or "").strip()
        if not value:
            continue
        text = _clean_text(opt.get_text())

        if value == "0":
            start_year = _current_season_start_year()
            options.append(SeasonOption(value=value, start_year=start_year, label=f"{start_year}-{start_year + 1}"))
            continue

        start_year: Optional[int]
        try:
            start_year = int(value)
        except ValueError:
            m = re.search(r"(\d{4})", text)
            start_year = int(m.group(1)) if m else None

        label = text
        if start_year is not None:
            label = f"{start_year}-{start_year + 1}"

        options.append(SeasonOption(value=value, start_year=start_year, label=label))

    # de-dupe by value
    uniq: Dict[str, SeasonOption] = {}
    for o in options:
        uniq.setdefault(o.value, o)
    return list(uniq.values())


def _extract_hidden(soup: BeautifulSoup, name: str) -> str:
    el = soup.select_one(f"input[name='{name}']")
    return (el.get("value") if el else "") or ""


@dataclasses.dataclass(frozen=True)
class Row:
    raekke_id: int
    name: str


def search_rows(session: requests.Session, *, gender: str, age_group: str, season_value: str) -> List[Row]:
    url = f"{BASE}/Soegning.aspx"

    first = session.get(url, headers={"accept": "text/html"}, timeout=60)
    first.raise_for_status()
    soup = BeautifulSoup(first.text, "html.parser")

    viewstate = _extract_hidden(soup, "__VIEWSTATE")
    viewstate_gen = _extract_hidden(soup, "__VIEWSTATEGENERATOR")
    event_validation = _extract_hidden(soup, "__EVENTVALIDATION")

    if not viewstate or not event_validation:
        raise RuntimeError("Could not find VIEWSTATE/EVENTVALIDATION on Soegning.aspx")

    division = AGEGROUP_TO_DIVISION.get(age_group)
    if not division:
        raise ValueError(f"Unsupported age group: {age_group}")

    payload = {
        "__EVENTTARGET": "",
        "__EVENTARGUMENT": "",
        "__LASTFOCUS": "",
        "__VIEWSTATE": viewstate,
        "__VIEWSTATEGENERATOR": viewstate_gen,
        "__EVENTVALIDATION": event_validation,
        "ctl00$ContentPlaceHolder1$Soegning$Search": "rbRows",
        "ctl00$ContentPlaceHolder1$Soegning$txtSelectedCenterSearchModule": "1",
        "ctl00$ContentPlaceHolder1$Soegning$ddlGender": GENDER_TO_SPORTSSYS[gender],
        "ctl00$ContentPlaceHolder1$Soegning$ddlDivision": division,
        "ctl00$ContentPlaceHolder1$Soegning$ddlSeason": season_value,
        "ctl00$ContentPlaceHolder1$Soegning$btnSearchRows": "Søg",
    }

    res = session.post(
        url,
        data=payload,
        headers={"content-type": "application/x-www-form-urlencoded", "accept": "text/html"},
        timeout=60,
    )
    res.raise_for_status()

    soup2 = BeautifulSoup(res.text, "html.parser")
    rows: Dict[int, Row] = {}

    for a in soup2.select("a[href*='Pulje-Oversigt.aspx?RaekkeId=']"):
        href = a.get("href") or ""
        m = re.search(r"RaekkeId=(\d+)", href)
        if not m:
            continue
        raekke_id = int(m.group(1))
        name = _clean_text(a.get_text()) or f"Række {raekke_id}"
        rows.setdefault(raekke_id, Row(raekke_id=raekke_id, name=name))

    return sorted(rows.values(), key=lambda r: r.name.casefold())


@dataclasses.dataclass(frozen=True)
class Pool:
    pulje_id: int
    name: str


def _normalize_pool_name(title: str) -> str:
    cleaned = _clean_text(title)
    if not cleaned:
        return cleaned
    comma = cleaned.rfind(",")
    if comma != -1:
        right = cleaned[comma + 1 :].strip()
        if right:
            return right
    return cleaned


def get_pools(session: requests.Session, raekke_id: int) -> List[Pool]:
    url = f"{BASE}/Pulje-Oversigt.aspx?RaekkeId={raekke_id}"
    res = session.get(url, headers={"accept": "text/html"}, timeout=60)
    res.raise_for_status()

    soup = BeautifulSoup(res.text, "html.parser")
    pools: Dict[int, Pool] = {}

    # Primary layout: headings containing 'pulje' + first link in the section.
    for header in soup.find_all(["h2", "h3"]):
        title = _clean_text(header.get_text())
        if not title or "pulje" not in title.lower():
            continue

        pulje_id: Optional[int] = None
        for sib in header.next_siblings:
            if getattr(sib, "name", None) in ("h2", "h3"):
                break
            if getattr(sib, "name", None) is None:
                continue
            link = sib.select_one("a[href*='Pulje-Stilling.aspx?PuljeId=']")
            if not link:
                link = sib.select_one("a[href*='Pulje-Komplet-Kampprogram.aspx?PuljeId=']")
            if not link:
                continue
            href = link.get("href") or ""
            m = re.search(r"PuljeId=(\d+)", href, flags=re.I)
            if m:
                pulje_id = int(m.group(1))
                break

        if pulje_id is not None:
            pools.setdefault(pulje_id, Pool(pulje_id=pulje_id, name=_normalize_pool_name(title)))

    # Alternative layout: table listing pool names directly.
    for a in soup.select("table a[href*='PuljeId=']"):
        href = a.get("href") or ""
        text = _clean_text(a.get_text())
        if not href or not text:
            continue
        if re.match(r"^(stilling|komplet\s+kampprogram|kampprogram|resultat(er)?)$", text, flags=re.I):
            continue
        m = re.search(r"PuljeId=(\d+)", href, flags=re.I)
        if not m:
            continue
        pulje_id = int(m.group(1))
        pools.setdefault(pulje_id, Pool(pulje_id=pulje_id, name=text))

    return sorted(pools.values(), key=lambda p: p.name.casefold())


def _parse_datetime(text: str) -> Optional[dt.datetime]:
    # Example: "18-09-25 kl. 21:00"
    cleaned = _clean_text(text)
    m = re.search(r"(\d{2})-(\d{2})-(\d{2}).*?(\d{1,2}):(\d{2})", cleaned)
    if not m:
        return None
    day, month, yy, hh, mm = (int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5)))
    year = 2000 + yy
    # Treat as local time; keep naive.
    return dt.datetime(year, month, day, hh, mm, 0)


def _parse_score(text: str) -> Optional[Tuple[int, int, Optional[str]]]:
    # Examples: "8 - 4", "4 - 2 SV", "4 - 2 (SV)", "4-2 SV."
    cleaned = _clean_text(text)
    m = re.match(r"^(\d+)\s*-\s*(\d+)(?:\s*(?:\(?\s*(SV)\s*\)?\.?))?$", cleaned, flags=re.I)
    if not m:
        return None
    home = int(m.group(1))
    away = int(m.group(2))
    note = "SV" if m.group(3) else None
    return home, away, note


@dataclasses.dataclass(frozen=True)
class Match:
    kamp_id: int
    start_at: Optional[dt.datetime]
    venue: Optional[str]
    home_team: str
    away_team: str
    home_score: Optional[int]
    away_score: Optional[int]
    result_note: Optional[str]
    referee_1: Optional[str] = None
    referee_2: Optional[str] = None


def _extract_value_from_label_table(soup: BeautifulSoup, label: str) -> Optional[str]:
    """Extract the value for a left-column label in a 2-column table.

    Sportssys' Kamp-Information uses a simple table layout:
      <tr><td>Dommer 1</td><td>...</td></tr>
    This helper finds the row and returns the second cell text.
    """

    wanted = _clean_text(label).casefold()
    for tr in soup.select("table tr"):
        cells = tr.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        left = _clean_text(cells[0].get_text(" ")).casefold()
        if left == wanted:
            value = _clean_text(cells[1].get_text(" "))
            return value or None
    return None


def get_referees(session: requests.Session, kamp_id: int) -> Tuple[Optional[str], Optional[str]]:
    """Fetch referee names from the match information page.

    Returns (dommer1, dommer2). Values are None when not present/parseable.
    """

    url = MATCH_INFO_URL.format(kamp_id=kamp_id)
    res = session.get(url, headers={"accept": "text/html"}, timeout=60)
    res.raise_for_status()

    soup = BeautifulSoup(res.text, "html.parser")
    d1 = _extract_value_from_label_table(soup, "Dommer 1")
    d2 = _extract_value_from_label_table(soup, "Dommer 2")
    return d1, d2


def get_matches(session: requests.Session, pulje_id: int) -> List[Match]:
    url = f"{BASE}/Pulje-Komplet-Kampprogram.aspx?PuljeId={pulje_id}"
    res = session.get(url, headers={"accept": "text/html"}, timeout=60)
    res.raise_for_status()

    soup = BeautifulSoup(res.text, "html.parser")
    matches: Dict[int, Match] = {}

    for tr in soup.select("table tr"):
        tds = tr.find_all("td")
        if len(tds) < 6:
            continue

        first_td = tds[0]
        link = first_td.select_one("a[href*='Kamp-Information.aspx?KampId=']")
        if not link:
            continue
        href = link.get("href") or ""
        m_kamp = re.search(r"KampId=(\d+)", href)
        if not m_kamp:
            continue
        kamp_id = int(m_kamp.group(1))

        start_at = _parse_datetime(tds[1].get_text())
        home_team = _clean_text(tds[2].get_text())
        away_team = _clean_text(tds[3].get_text())
        venue = _clean_text(tds[4].get_text()) or None

        score_text = tds[5].get_text()
        score = _parse_score(score_text)

        row_text = _clean_text(" ".join(td.get_text(" ") for td in tds))
        note_from_row = "SV" if re.search(r"\bSV\b", row_text, flags=re.I) else None

        home_score = score[0] if score else None
        away_score = score[1] if score else None
        result_note = (score[2] if score else None) or note_from_row

        matches[kamp_id] = Match(
            kamp_id=kamp_id,
            start_at=start_at,
            venue=venue,
            home_team=home_team,
            away_team=away_team,
            home_score=home_score,
            away_score=away_score,
            result_note=result_note,
        )

    def sort_key(mm: Match) -> float:
        if not mm.start_at:
            return 0.0
        return mm.start_at.timestamp()

    return sorted(matches.values(), key=sort_key)


def _result_string(m: Match) -> str:
    if m.home_score is None or m.away_score is None:
        return ""
    s = f"{m.home_score}-{m.away_score}"
    if m.result_note:
        s += f" {m.result_note}"
    return s


def export_csv(
    *,
    season_start: int,
    gender: Optional[str],
    age_group: Optional[str],
    export_all: bool,
    out_path: str,
    encoding: str,
    sleep_s: float,
    row_name_contains: Optional[str],
) -> None:
    session = requests.Session()
    session.headers.update(
        {
            "user-agent": "FloorballDanmarkExporter/1.0",
            "accept": "text/html,application/xhtml+xml",
        }
    )

    season_value = str(season_start)
    # Verify season exists (and fallback to '0' only if the requested season is current)
    opts = get_season_options(session)
    if opts:
        matched = [o for o in opts if o.start_year == season_start]
        if matched:
            season_value = matched[0].value
        else:
            current = _current_season_start_year()
            if season_start == current:
                season_value = "0"
            else:
                available = ", ".join(sorted({str(o.start_year) for o in opts if o.start_year is not None}))
                raise RuntimeError(f"Season {season_start} not found on Sportssys. Available start years: {available}")

    season_label = f"{season_start}-{season_start + 1}"

    if export_all:
        genders = ["MEN", "WOMEN"]
        age_groups = sorted(AGEGROUP_TO_DIVISION.keys())
    else:
        if not gender or not age_group:
            raise ValueError("When --all is not set you must provide --gender and --age-group")
        genders = [gender]
        age_groups = [age_group]

    header = [
        "Sæson",
        "KampID",
        "Dato",
        "Tid",
        "Sted",
        "Køn",
        "Alder",
        "Liga",
        "Pulje",
        "Hjemmehold",
        "Udehold",
        "Resultat",
        "Dommer 1",
        "Dommer 2",
    ]

    with open(out_path, "w", newline="", encoding=encoding) as f:
        w = csv.writer(f, delimiter=",")
        w.writerow(header)

        seen_kamp_ids: set[int] = set()
        referee_cache: Dict[int, Tuple[Optional[str], Optional[str]]] = {}

        for g in genders:
            for ag in age_groups:
                rows = search_rows(session, gender=g, age_group=ag, season_value=season_value)
                if row_name_contains:
                    needle = row_name_contains.casefold()
                    rows = [r for r in rows if needle in r.name.casefold()]

                if not rows:
                    continue

                for row in rows:
                    pools = get_pools(session, row.raekke_id)
                    if not pools:
                        continue

                    for pool in pools:
                        matches = get_matches(session, pool.pulje_id)

                        for m in matches:
                            if m.kamp_id in seen_kamp_ids:
                                continue
                            seen_kamp_ids.add(m.kamp_id)

                            if m.kamp_id not in referee_cache:
                                try:
                                    referee_cache[m.kamp_id] = get_referees(session, m.kamp_id)
                                except Exception:
                                    referee_cache[m.kamp_id] = (None, None)
                                if sleep_s:
                                    time.sleep(sleep_s)

                            ref1, ref2 = referee_cache.get(m.kamp_id, (None, None))

                            date_str = m.start_at.strftime("%Y-%m-%d") if m.start_at else ""
                            time_str = m.start_at.strftime("%H:%M") if m.start_at else ""

                            w.writerow(
                                [
                                    season_label,
                                    m.kamp_id,
                                    date_str,
                                    time_str,
                                    m.venue or "",
                                    GENDER_LABEL[g],
                                    AGEGROUP_LABEL.get(ag, ag),
                                    row.name,
                                    pool.name,
                                    m.home_team,
                                    m.away_team,
                                    _result_string(m),
                                    ref1 or "",
                                    ref2 or "",
                                ]
                            )

                        if sleep_s:
                            time.sleep(sleep_s)

                    if sleep_s:
                        time.sleep(sleep_s)


def main(argv: List[str]) -> int:
    p = argparse.ArgumentParser(description="Export Sportssys kampprogram to CSV")
    p.add_argument("--season-start", type=int, required=True, help="Season start year, e.g. 2025")
    p.add_argument("--all", action="store_true", help="Export all genders and age groups for the season")
    p.add_argument("--gender", choices=["MEN", "WOMEN"], default=None)
    p.add_argument("--age-group", default=None, choices=sorted(AGEGROUP_TO_DIVISION.keys()))
    p.add_argument("--out", default="kampprogram.csv")
    p.add_argument("--encoding", default="utf-8-sig", help="CSV encoding (default: utf-8-sig for Excel)")
    p.add_argument("--sleep", type=float, default=0.1, help="Delay between requests in seconds")
    p.add_argument(
        "--row-name-contains",
        default=None,
        help="Only export leagues where the league name contains this text (case-insensitive)",
    )

    args = p.parse_args(argv)

    try:
        export_csv(
            season_start=args.season_start,
            gender=args.gender,
            age_group=args.age_group,
            export_all=bool(args.all),
            out_path=args.out,
            encoding=args.encoding,
            sleep_s=args.sleep,
            row_name_contains=args.row_name_contains,
        )
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    print(f"Wrote CSV: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
