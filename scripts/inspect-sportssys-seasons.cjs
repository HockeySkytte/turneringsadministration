/* eslint-disable no-console */

(async () => {
  const url = "https://floorballresultater.sportssys.dk/tms/Turneringer-og-resultater/Soegning.aspx";
  const res = await fetch(url, { headers: { "user-agent": "FloorballPortalen/1.0" } });
  const html = await res.text();

  const cheerio = require("cheerio");
  const $ = cheerio.load(html);
  const sel = $("select[name='ctl00$ContentPlaceHolder1$Soegning$ddlSeason']");
  const options = sel
    .find("option")
    .toArray()
    .map((el) => ({
      value: $(el).attr("value"),
      text: $(el).text().trim(),
    }));

  console.log("Season options:");
  console.log(options);
})();
