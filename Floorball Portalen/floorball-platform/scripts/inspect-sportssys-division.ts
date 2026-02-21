import * as cheerio from "cheerio";

const URL =
  "https://floorballresultater.sportssys.dk/tms/Turneringer-og-resultater/Soegning.aspx";

async function main() {
  const res = await fetch(URL, {
    headers: {
      "user-agent": "FloorballPortalen/inspect",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const sel = $("select[name='ctl00$ContentPlaceHolder1$Soegning$ddlDivision']");
  if (sel.length === 0) {
    throw new Error("Could not find ddlDivision select in HTML");
  }

  const options = sel
    .find("option")
    .toArray()
    .map((o) => ({
      value: $(o).attr("value") ?? "",
      label: $(o).text().replace(/\u00a0/g, " ").trim(),
    }))
    .filter((o) => o.label.length > 0);

  // eslint-disable-next-line no-console
  console.log(options);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
