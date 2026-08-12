// Dependency-free PDF export for the Accounts tab. Kept intentionally small
// so it runs in both the local Node server and Vercel's serverless runtime.

const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 42;

function ascii(value) {
  return String(value ?? "")
    .normalize("NFKD").replace(/[^\x20-\x7e]/g, "-")
    .replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function count(value) {
  const n = Number(value) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function latest(values) {
  for (let i = (values?.length || 0) - 1; i >= 0; i--) if (values[i] != null) return Number(values[i]) || 0;
  return null;
}

function esc(text) { return `(${ascii(text)})`; }

function text(x, y, value, size = 9, bold = false, color = "0.11 0.11 0.11") {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${y} Td ${esc(value)} Tj ET\n`;
}

function line(x1, y1, x2, y2, color = "0.86 0.84 0.80", width = 0.5) {
  return `${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
}

function rect(x, y, w, h, fill) { return `${fill} rg ${x} ${y} ${w} ${h} re f\n`; }

function truncate(value, max) {
  const s = ascii(value);
  return s.length > max ? `${s.slice(0, Math.max(0, max - 3))}...` : s;
}

function pageHeader(title, kicker, pageNo) {
  let out = rect(0, PAGE_H - 4, PAGE_W, 4, "0.85 0.17 0.12");
  out += text(MARGIN, PAGE_H - 44, kicker.toUpperCase(), 8, true, "0.85 0.17 0.12");
  out += text(MARGIN, PAGE_H - 70, title, 20, true);
  out += text(MARGIN, 20, "Keystone Account Metrics - live export", 7, false, "0.43 0.42 0.40");
  out += text(PAGE_W - 72, 20, `Page ${pageNo}`, 7, false, "0.43 0.42 0.40");
  return out;
}

function table(content, y, headers, rows, widths, rowH = 23) {
  const x0 = MARGIN;
  const totalW = sum(widths);
  content.push(rect(x0, y - rowH, totalW, rowH, "0.11 0.11 0.11"));
  let x = x0;
  headers.forEach((header, i) => {
    content.push(text(x + 5, y - 15, truncate(header, Math.floor(widths[i] / 5.2)), 7, true, "1 1 1"));
    x += widths[i];
  });
  y -= rowH;
  rows.forEach((row, r) => {
    if (r % 2) content.push(rect(x0, y - rowH, totalW, rowH, "0.97 0.95 0.91"));
    x = x0;
    row.forEach((value, i) => {
      content.push(text(x + 5, y - 15, truncate(value, Math.floor(widths[i] / 4.8)), 7.5));
      x += widths[i];
    });
    content.push(line(x0, y - rowH, x0 + totalW, y - rowH));
    y -= rowH;
  });
}

function buildPdf(pageStreams) {
  const objects = [null];
  const add = (body) => { objects.push(body); return objects.length - 1; };
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pagesId = add("");
  const pageIds = [];
  for (const stream of pageStreams) {
    const bytes = Buffer.from(stream, "ascii");
    const contentId = add(`<< /Length ${bytes.length} >>\nstream\n${stream}endstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[pagesId] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(pdf, "ascii");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

export function buildAccountMetricsPdf({ overview, accounts, topVideos, generatedDate }) {
  const rows = overview.accounts.map((item) => {
    const account = accounts.find((a) => Number(a.id) === Number(item.id)) || {};
    return {
      name: item.name,
      status: account.runout_date || "No schedule",
      views: sum(item.growth?.views || []), likes: sum(item.growth?.likes || []),
      comments: sum(item.growth?.comments || []), shares: sum(item.growth?.shares || []),
      postViews: sum(item.posted?.views || []), posts: sum(item.posted?.posts || []),
      followers: latest(item.growth?.followers || []) ?? account.follower_count
    };
  });
  const pages = [];
  let c = [pageHeader("Keystone Account Metrics", "Live 90-day account export", 1)];
  c.push(text(MARGIN, 510, `Generated ${generatedDate} - America/New_York`, 9, false, "0.43 0.42 0.40"));
  const totals = [sum(rows.map(r => r.views)), sum(rows.map(r => r.likes)), sum(rows.map(r => r.comments)), sum(rows.map(r => r.shares)), sum(rows.map(r => r.posts)), sum(rows.map(r => r.followers))];
  const labels = ["Views gained", "Likes gained", "Comments gained", "Shares gained", "Posts published", "Known followers"];
  const cardW = (PAGE_W - MARGIN * 2) / 6;
  totals.forEach((value, i) => {
    c.push(rect(MARGIN + i * cardW, 440, cardW - 2, 60, "0.97 0.95 0.91"));
    c.push(text(MARGIN + i * cardW + 12, 472, count(value), 16, true));
    c.push(text(MARGIN + i * cardW + 12, 452, labels[i], 7, true, "0.43 0.42 0.40"));
  });
  c.push(text(MARGIN, 410, "Top accounts by views gained", 12, true));
  rows.sort((a, b) => b.views - a.views).slice(0, 10).forEach((row, i) => {
    const y = 382 - i * 28;
    c.push(text(MARGIN, y, row.name, 8.5));
    c.push(rect(205, y - 2, Math.max(2, 360 * row.views / Math.max(1, rows[0].views)), 10, "0.90 0.19 0.13"));
    c.push(text(580, y, count(row.views), 8.5, true));
  });
  pages.push(c.join(""));

  const chunks = [rows.slice(0, 12), rows.slice(12)];
  chunks.forEach((chunk, index) => {
    c = [pageHeader("Account metric detail", `90-day account detail ${index + 1} of ${chunks.length}`, pages.length + 1)];
    table(c, 505, ["Account", "Views gained", "Likes gained", "Comments", "Shares", "Followers", "Posts"],
      chunk.map(r => [r.name, count(r.views), count(r.likes), count(r.comments), count(r.shares), r.followers == null ? "-" : count(r.followers), count(r.posts)]),
      [180, 90, 90, 75, 75, 75, 70], 27);
    pages.push(c.join(""));
  });

  c = [pageHeader("Schedule and publishing", "Current account status", pages.length + 1)];
  table(c, 505, ["Account", "Scheduled through", "90d posts", "Post-date views"],
    rows.map(r => [r.name, r.status, count(r.posts), count(r.postViews)]), [245, 165, 100, 135], 24);
  pages.push(c.join(""));

  c = [pageHeader("Top videos", "Top content in the 90-day window", pages.length + 1)];
  table(c, 505, ["#", "Account", "Date", "Video", "Views", "Likes"],
    topVideos.slice(0, 12).map((v, i) => [String(i + 1), v.account_name || "", new Date(Number(v.create_time) * 1000).toLocaleDateString("en-US", { month: "numeric", day: "numeric", timeZone: "America/New_York" }), v.title || "Untitled", count(v.views), count(v.likes)]),
    [30, 130, 50, 315, 75, 75], 29);
  pages.push(c.join(""));
  return buildPdf(pages);
}
