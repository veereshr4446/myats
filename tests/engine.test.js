// Tests for the MyATS scoring engine.
// Runs the real <script> from index.html inside a Node "vm" with a stub DOM,
// so there is nothing to install: `node --test tests/`
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const code = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];

// A "do nothing" DOM: any property read returns another stub, any call returns a stub.
const stub = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k === "length" ? 0 : k === "value" ? "" : stub),
  set: () => true,
  apply: () => stub,
  construct: () => stub,
});
const ctx = vm.createContext({
  document: stub,
  window: {},
  navigator: {},
  location: { protocol: "file:" },
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false }),
  IntersectionObserver: function () { return { observe() {}, unobserve() {} }; },
  setTimeout: () => 0,
  clearTimeout() {},
  requestAnimationFrame: () => 0,
  addEventListener() {},
  alert() {},
  console,
});
vm.runInContext(code, ctx);
const get = (name) => vm.runInContext(name, ctx);

const evaluate = get("evaluate"), sections = get("sections"), tipsHTML = get("tipsHTML");
const resumeHTML = get("resumeHTML"), resumeText = get("resumeText"), robot = get("robot");
const kw = get("kw"), SAMPLE = get("SAMPLE"), SAMPLE2 = get("SAMPLE2"), EXAMPLE = get("EXAMPLE");
const VERBS = get("VERBS");

// A resume that should pass every check: 4 headings, full contact, 12 verbs, ~330 words.
const verbs = VERBS.slice(0, 12);
const filler = "worked closely with the team on features that mattered to customers and measured 40 results ".repeat(2);
const GOOD = [
  "Asha Rao", "asha.rao@mail.com | +91 98765 43210 | linkedin.com/in/asharao",
  "Experience",
  ...verbs.map((v, i) => `${v[0].toUpperCase() + v.slice(1)} a project that improved results by ${10 + i}% for ${100 + i} users ${filler}`),
  "Education", "B.E. Computer Science, Sunrise Institute, 2024 - 2028",
  "Skills", "JavaScript, React, Node.js, SQL, Git, Docker",
  "Projects", "Campus Event Finder with 40 events and 500 users",
].join("\n");

const titles = (a) => a.map((x) => x.t);
const total = (r) => Object.values(r.B).reduce((a, x) => a + x[0], 0);

test("a complete resume scores 100 with nothing to fix", () => {
  const r = evaluate(GOOD, "pdf");
  assert.equal(r.score, 100, JSON.stringify([titles(r.bad), titles(r.warn)]));
  assert.equal(r.bad.length, 0);
});

test("score is always between 0 and 100 and equals the sum of the parts", () => {
  for (const [t, e] of [[GOOD, "pdf"], ["", "pdf"], ["hello", "png"], [SAMPLE, "docx"], [GOOD.repeat(6), "pdf"]]) {
    const r = evaluate(t, e);
    assert.ok(r.score >= 0 && r.score <= 100);
    assert.equal(r.score, Math.min(100, total(r)));
  }
});

test("empty text is flagged as unreadable", () => {
  const r = evaluate("   ", "pdf");
  assert.ok(titles(r.bad).includes("No readable text"));
  assert.equal(r.m.words, 0);
});

test("short resumes lose the length points", () => {
  const r = evaluate("Asha Rao asha@mail.com Experience Education Skills", "pdf");
  assert.ok(titles(r.bad).includes("Too short"));
  assert.equal(r.B.Length[0], 0);
});

test("very long resumes get a warning and half the length points", () => {
  const r = evaluate(GOOD + "\n" + "word ".repeat(1600), "pdf");
  assert.ok(titles(r.warn).includes("Too long"));
  assert.equal(r.B.Length[0], 10);
});

test("missing LinkedIn is a warning and costs 6 contact points", () => {
  const r = evaluate(GOOD.replace("linkedin.com/in/asharao", ""), "pdf");
  assert.ok(titles(r.warn).includes("LinkedIn URL missing"));
  assert.equal(r.B.Contact[0], 14);
});

test("missing email is a fix-first issue", () => {
  const r = evaluate(GOOD.replace("asha.rao@mail.com", ""), "pdf");
  assert.ok(titles(r.bad).includes("Email missing"));
});

test("non-standard headings are caught", () => {
  const r = evaluate(GOOD.replace("Experience", "My Journey"), "pdf");
  assert.ok(titles(r.bad).includes("Experience heading missing"));
  assert.equal(r.m.heads.Experience, false);
});

test("file format scoring", () => {
  assert.equal(evaluate(GOOD, "pdf").B.Format[0], 15);
  assert.equal(evaluate(GOOD, "docx").B.Format[0], 15);
  assert.equal(evaluate(GOOD, "txt").B.Format[0], 15);
  assert.equal(evaluate(GOOD, "doc").B.Format[0], 5);
  assert.equal(evaluate(GOOD, "png").B.Format[0], 0);
  const img = evaluate(GOOD, "ocr-img");
  assert.equal(img.B.Format[0], 0);
  assert.ok(titles(img.bad).includes("Image file"));
  assert.ok(img.m.ocr);
  const scan = evaluate(GOOD, "ocr-pdf");
  assert.equal(scan.B.Format[0], 5);
  assert.ok(titles(scan.warn).includes("Scanned PDF"));
});

test("buzzwords are warned about", () => {
  const r = evaluate(GOOD + "\nResponsible for many things and a hard-working team player", "pdf");
  assert.ok(titles(r.warn).includes("Weak phrases and buzzwords"));
});

test("section parser finds standard headings", () => {
  const s = sections(GOOD);
  for (const k of ["Experience", "Education", "Skills", "Projects"]) assert.ok(Array.isArray(s[k]), k);
  assert.match(s.Education.join(" "), /Sunrise/);
});

test("rewrite tips fix weak starts and skip title/date lines", () => {
  const txt = ["Experience", "Software Intern, Acme Labs (Jun 2025 - Aug 2025)",
    "Responsible for fixing bugs and worked on dashboard features for the support team.", "Education"].join("\n");
  const out = tipsHTML(txt);
  assert.match(out, /Fixed bugs/);
  assert.doesNotMatch(out, /Acme Labs/);
});

test("user text is HTML-escaped in the robot view and the builder", () => {
  assert.match(robot("<img src=x onerror=alert(1)> managed 5 teams"), /&lt;img/);
  const d = JSON.parse(JSON.stringify(EXAMPLE));
  d.name = "<script>alert(1)</script>";
  assert.doesNotMatch(resumeHTML(d), /<script>/);
});

test("builder output uses standard headings the scorer recognises", () => {
  const d = JSON.parse(JSON.stringify(EXAMPLE));
  const r = evaluate(resumeText(d), "txt");
  for (const k of ["Experience", "Education", "Skills", "Projects"]) assert.equal(r.m.heads[k], true, k);
  assert.ok(r.m.email && r.m.phone && r.m.linkedin);
});

test("keyword matching respects word boundaries", () => {
  assert.ok(kw("built apis with node.js", "Node.js"));
  assert.ok(kw("c++ and c#", "C++"));
  assert.ok(!kw("javascript developer", "Java"));
});

test("the improved sample resume beats the original", () => {
  assert.ok(evaluate(SAMPLE2, "pdf").score > evaluate(SAMPLE, "pdf").score);
});

// ---- Fresher checks (tips only, no score change) ----
const STRONG_FRESHER = `Student Name
Bengaluru github.com/student linkedin.com/in/student student@example.com 9876543210
Education
Some Engineering College 2023 - 2027
B.E. in Computer Science CGPA: 8.5
Projects
Smart Notes | React, Node.js, MongoDB Jan 2026
• Built a notes app with search, reducing lookup time by 40%.
• Developed REST APIs and deployed them for 200 users.
Technical Skills
Languages: C, Python, JavaScript
Frontend: React, HTML, CSS
Achievements
• State Hackathon - Winner, 1st place 2026`;
const WEAK_FRESHER = `Student Name student@example.com
Education
Some Engineering College B.E. in Computer Science
Projects
Notes app: made a notes website for my class and it was nice.
Skills
C, Python, JavaScript, HTML, CSS, React, Node, MongoDB, SQL, Git`;

test("fresher: strong resume gets the good fresher signals", () => {
  const r = evaluate(STRONG_FRESHER, "pdf");
  const t = r.ok.map((x) => x.t);
  assert.equal(r.m.fresher, true);
  for (const k of ["CGPA or marks", "Tools next to projects", "Project or GitHub link", "Achievements with rank", "Skills in groups"])
    assert.ok(t.includes(k), k);
});
test("fresher: weak resume gets simple fix tips", () => {
  const r = evaluate(WEAK_FRESHER, "pdf");
  const t = r.warn.map((x) => x.t);
  for (const k of ["CGPA missing", "Add tools to each project", "GitHub link missing", "Add an achievements section", "Group your skills"])
    assert.ok(t.includes(k), k);
});
test("fresher: experienced resumes get no fresher tips", () => {
  const r = evaluate(SAMPLE, "pdf");
  assert.ok(!r.warn.concat(r.ok).some((x) => x.t === "CGPA missing" || x.t === "Tools next to projects"));
});
test("fresher: tips do not change the score", () => {
  const a = evaluate(STRONG_FRESHER, "pdf").score;
  const b = evaluate(STRONG_FRESHER.replace("CGPA: 8.5", ""), "pdf").score;
  assert.equal(a, b);
});
