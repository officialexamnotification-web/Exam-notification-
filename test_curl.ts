import http from "node:http";
http.get("http://0.0.0.0:3000/api/proxy?url=https://www.sarkariresult.com/2025/up-anganwadi-recruitment/", (res) => {
  let data = "";
  res.on("data", (c) => data += c);
  res.on("end", () => {
      const match = data.match(/youtube\.com\/results\?search_query=[^"]+/g);
      console.log("Found matches:", match);
  });
});
