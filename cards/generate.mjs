// Renders the profile's pinned repos as GitHub-style SVG cards and rewrites the
// README block between the cards markers to show them in pin order.
// Usage: GITHUB_TOKEN=... GITHUB_REPOSITORY_OWNER=<user> node cards/generate.mjs
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const esc = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

// shortcut: wraps by character count, not measured text width; fine for short descriptions
function wrap(text, max = 58, lines = 2) {
  const out = [""];
  for (const word of text.split(/\s+/)) {
    const cur = out.length - 1;
    if ((out[cur] + " " + word).trim().length <= max) out[cur] = (out[cur] + " " + word).trim();
    else if (out.length < lines) out.push(word);
    else {
      out[cur] = out[cur].slice(0, max - 1).trimEnd() + "…";
      break;
    }
  }
  return out;
}

const ICON_REPO =
  "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z";
const ICON_STAR =
  "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z";
const ICON_FORK =
  "M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z";

function card(r) {
  const lang = r.primaryLanguage;
  const desc = wrap(r.description ?? "");
  let x = 16;
  const footer = [];
  if (lang) {
    footer.push(`<circle cx="${x + 6}" cy="111" r="6" fill="${lang.color ?? "#8b949e"}"/>`,
      `<text x="${x + 18}" y="115" class="muted">${esc(lang.name)}</text>`);
    x += 34 + lang.name.length * 6.5;
  }
  for (const [icon, n] of [[ICON_STAR, r.stargazerCount], [ICON_FORK, r.forkCount]]) {
    if (!n) continue;
    footer.push(`<path transform="translate(${x} 103)" class="icon" d="${icon}"/>`,
      `<text x="${x + 20}" y="115" class="muted">${fmt(n)}</text>`);
    x += 32 + fmt(n).length * 7;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="130" viewBox="0 0 400 130" role="img" aria-label="${esc(r.nameWithOwner)}">
<style>
  .bg{fill:#fff;stroke:#d0d7de}.name{fill:#0969da;font:600 14px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
  .desc,.muted{font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}.desc{fill:#59636e}.muted{fill:#59636e}.icon{fill:#59636e}
  @media (prefers-color-scheme:dark){.bg{fill:#0d1117;stroke:#3d444d}.name{fill:#4493f8}.desc,.muted{fill:#9198a1}.icon{fill:#9198a1}}
</style>
<rect class="bg" x="0.5" y="0.5" width="399" height="129" rx="6"/>
<path transform="translate(16 16)" class="icon" d="${ICON_REPO}"/>
<text x="40" y="29" class="name">${esc(r.nameWithOwner)}</text>
${desc.map((l, i) => `<text x="16" y="${58 + i * 18}" class="desc">${esc(l)}</text>`).join("\n")}
${footer.join("\n")}
</svg>
`;
}

async function pinnedRepos(login) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "User-Agent": "readme-cards" },
    body: JSON.stringify({
      query: `query($login:String!){user(login:$login){pinnedItems(first:6,types:REPOSITORY){nodes{... on Repository{
        nameWithOwner url description stargazerCount forkCount primaryLanguage{name color}}}}}}`,
      variables: { login },
    }),
  });
  const { data, errors } = await res.json();
  if (!res.ok || errors || !data?.user) throw new Error(`${res.status} ${JSON.stringify(errors)}`);
  return data.user.pinnedItems.nodes;
}

const login = process.env.GITHUB_REPOSITORY_OWNER;
if (!process.env.GITHUB_TOKEN || !login) throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY_OWNER are required");

const repos = await pinnedRepos(login);
if (!repos.length) throw new Error(`no pinned repos for ${login}`);

const dir = new URL(".", import.meta.url);
for (const f of readdirSync(dir)) if (f.endsWith(".svg")) rmSync(new URL(f, dir));

const links = repos.map((r) => {
  const file = `${r.nameWithOwner.replace("/", "-")}.svg`;
  writeFileSync(new URL(file, dir), card(r));
  return `<a href="${r.url}"><img width="45%" src="./cards/${file}" alt="${esc(r.nameWithOwner)}"></a>`;
});

const rows = [];
for (let i = 0; i < links.length; i += 2) rows.push(links.slice(i, i + 2).join("&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\n"));

const readmeUrl = new URL("../README.md", import.meta.url);
const readme = readFileSync(readmeUrl, "utf8");
const block = /<!-- cards:start -->[\s\S]*<!-- cards:end -->/;
if (!block.test(readme)) throw new Error("README is missing the <!-- cards:start --> / <!-- cards:end --> markers");
writeFileSync(readmeUrl, readme.replace(block, `<!-- cards:start -->\n${rows.join("\n<br/><br/>\n")}\n<!-- cards:end -->`));
console.log(repos.map((r) => r.nameWithOwner).join("\n"));
