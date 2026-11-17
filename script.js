// script.js
// Loads resume.md, keeps ONLY the Website Summary part, turns it into a data
// object, and builds the page from that object.
// The AI Details part is cut off and never read by the parser.

const START_MARKER = "<!-- WEBSITE-SUMMARY-START -->";
const END_MARKER = "<!-- WEBSITE-SUMMARY-END -->";

// Which resume.md heading fills which part of the data object.
const SECTION_KEYS = {
  "hero": "hero",
  "highlights": "highlights",
  "what i do": "whatIDo",
  "contact": "contact",
  "summary": "summary",
  "professional experience": "work",
  "projects": "projects",
  "education": "education",
  "technical & delivery capabilities": "skills",
};

// ---------- Step 1: get the summary text ----------

async function loadSummary() {
  const response = await fetch("resume.md");
  if (!response.ok) throw new Error("Could not load resume.md (status " + response.status + ")");
  const fullText = await response.text();

  const start = fullText.indexOf(START_MARKER);
  const end = fullText.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Could not find the WEBSITE-SUMMARY markers in resume.md");
  }
  // Only the text between the markers. Everything after END_MARKER (AI Details) is dropped here.
  const summary = fullText.slice(start + START_MARKER.length, end);

  // Safety check: if the AI Details part ever ends up inside the summary
  // (for example, a marker gets moved by mistake), stop instead of showing it.
  if (summary.includes("AI-DETAILS-START") || summary.includes("AI-DETAILS-END")) {
    throw new Error("The AI Details part is inside the Website Summary markers in resume.md");
  }
  return summary;
}

// ---------- Step 2: parse the text into one data object ----------

// "**Status:** Open to roles" -> { key: "Status", value: "Open to roles" }
function splitKeyValue(text) {
  const match = text.match(/^\*\*(.+?)\*\*\s*(.*)$/);
  if (!match) return { key: "", value: text };
  return { key: match[1].replace(/:$/, "").trim(), value: match[2].replace(/^:\s*/, "").trim() };
}

function parseResume(text) {
  const data = {
    name: "", tagline: "", location: "", links: {},
    hero: {}, highlights: [], whatIDo: [], contact: "",
    summary: "", work: [], education: [], projects: [], skills: [],
  };

  let current = null;   // which part of `data` we're filling, e.g. "work"
  let entry = null;     // the current job or project
  let headerLines = 0;  // plain lines right after the name: tagline, then contact line

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const listItem = line.match(/^(?:-|\d+\.)\s+(.*)$/); // "- item" or "1. item"

    // Name, then tagline and contact line under it.
    if (heading && heading[1].length === 1) {
      data.name = heading[2];
      headerLines = 1;
      continue;
    }
    if (headerLines > 0 && !heading && !current) {
      if (headerLines === 1) {
        data.tagline = line;
      } else {
        for (const item of line.split("|").map((s) => s.trim())) {
          if (item.includes("linkedin.com")) data.links.linkedin = "https://" + item;
          else if (item.includes("github.com")) data.links.github = "https://" + item;
          else data.location = item;
        }
      }
      headerLines++;
      continue;
    }

    if (heading) {
      const key = SECTION_KEYS[heading[2].toLowerCase()];
      if (key) {
        current = key;
        entry = null;
      } else if (current === "work" || current === "projects") {
        // A job or project: "Company | Role" or "Project | Status"
        const [title, ...rest] = heading[2].split("|").map((s) => s.trim());
        entry = { title, subtitle: rest.join(" · "), meta: "", groups: [{ title: "", bullets: [] }] };
        data[current].push(entry);
      } else {
        console.warn("Heading not used on the page:", heading[2]);
      }
      continue;
    }

    if (listItem) {
      const item = listItem[1];
      const { key, value } = splitKeyValue(item);
      if (current === "hero") data.hero[key.toLowerCase()] = value;
      else if (current === "highlights") data.highlights.push({ number: key, label: value });
      else if (current === "whatIDo") data.whatIDo.push({ title: key, description: value });
      else if (current === "contact") data.contact = item;
      else if (current === "skills") data.skills.push({ category: key, items: value.split(",").map((s) => s.trim()) });
      else if (entry) entry.groups[entry.groups.length - 1].bullets.push(item);
      else console.warn("List item not used on the page:", item);
      continue;
    }

    // A whole line in **bold** inside a job starts a new group of bullets.
    if (entry && /^\*\*[^*]+\*\*$/.test(line)) {
      entry.groups.push({ title: line.slice(2, -2), bullets: [] });
      continue;
    }

    // Plain text lines.
    if (current === "summary") {
      data.summary += (data.summary ? " " : "") + line;
    } else if (current === "education") {
      const [school, degree, date] = line.split("|").map((s) => s.trim());
      data.education.push({ school, degree, date });
    } else if (entry && !entry.meta) {
      entry.meta = line; // location and dates line under a job
    } else {
      console.warn("Line not used on the page:", line);
    }
  }

  // Drop empty "no title" groups (jobs whose bullets all sit under bold group titles).
  for (const e of [...data.work, ...data.projects]) {
    e.groups = e.groups.filter((g) => g.title || g.bullets.length);
  }
  return data;
}

// ---------- Step 3: helpers that build page elements ----------

// Makes an element and fills it with text, turning **bold** into <strong>.
// Uses textContent (not innerHTML), so text from the file is never run as code.
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) addFormattedText(node, text);
  return node;
}

function addFormattedText(node, text) {
  const parts = text.split("**");
  parts.forEach((part, i) => {
    if (part === "") return;
    if (i % 2 === 1) {
      const strong = document.createElement("strong");
      strong.textContent = part;
      node.appendChild(strong);
    } else {
      node.appendChild(document.createTextNode(part));
    }
  });
}

// ---------- Step 4: build each part of the page ----------

function renderNav(data) {
  document.getElementById("nav-name").textContent = data.name;
  document.title = data.name + " | " + data.tagline;
}

function renderHero(data) {
  document.getElementById("hero-status").textContent = data.hero.status;
  document.getElementById("hero-location").textContent = data.location;
  document.getElementById("hero-intro").textContent = data.hero.intro;
  document.getElementById("hero-photo").alt = "Headshot of " + data.name;

  // Headline: wrap every "agentic AI" in a blue <span>, using text nodes only (no innerHTML).
  const headline = document.getElementById("hero-headline");
  data.hero.headline.split(/(agentic AI)/i).forEach((part, i) => {
    if (part === "") return;
    if (i % 2 === 1) headline.appendChild(el("span", part, "highlight"));
    else headline.appendChild(document.createTextNode(part));
  });

  // Links come from the contact line in resume.md.
  document.getElementById("hero-connect").href = data.links.linkedin;
  document.getElementById("hero-linkedin").href = data.links.linkedin;
  document.getElementById("hero-github").href = data.links.github;
}

function renderAbout(data) {
  document.getElementById("about-summary").textContent = data.summary;

  // One card per Highlight: big number on top, label underneath.
  const stats = document.getElementById("about-stats");
  for (const h of data.highlights) {
    const card = el("div", null, "card stat");
    card.appendChild(el("p", h.number, "stat-number"));
    card.appendChild(el("p", h.label, "stat-label"));
    stats.appendChild(card);
  }
}

function renderWhatIDo(data) {
  const list = document.getElementById("what-i-do-list");
  data.whatIDo.forEach((item, i) => {
    const li = el("li", null, "card service");
    // 1 -> "01". Hidden from screen readers because the <ol> already announces the number.
    const number = el("span", String(i + 1).padStart(2, "0"), "service-number");
    number.setAttribute("aria-hidden", "true");
    const text = el("div", null, "service-text");
    text.appendChild(el("h3", item.title, "service-title"));
    text.appendChild(el("p", item.description, "service-description"));
    li.appendChild(number);
    li.appendChild(text);
    list.appendChild(li);
  });
}

// One point on a timeline: a dot (drawn by CSS) plus a card.
function timelineItem(title, subtitle, meta) {
  const li = el("li", null, "timeline-item");
  const card = el("div", null, "card timeline-card");
  card.appendChild(el("h4", title, "timeline-title"));
  if (subtitle) card.appendChild(el("p", subtitle, "timeline-subtitle"));
  if (meta) card.appendChild(el("p", meta.split("|").map((s) => s.trim()).join(" · "), "timeline-meta"));
  li.appendChild(card);
  return { li, card };
}

function renderExperience(data) {
  const work = document.getElementById("timeline-work");
  for (const job of data.work) {
    const { li, card } = timelineItem(job.title, job.subtitle, job.meta);
    for (const group of job.groups) {
      if (group.title) card.appendChild(el("h5", group.title, "timeline-group"));
      const ul = el("ul", null, "timeline-bullets");
      group.bullets.forEach((b) => ul.appendChild(el("li", b))); // "**Label:** text" -> bold label
      card.appendChild(ul);
    }
    work.appendChild(li);
  }

  const education = document.getElementById("timeline-education");
  for (const school of data.education) {
    education.appendChild(timelineItem(school.school, school.degree, school.date).li);
  }
}

function renderSkills(data) {
  const grid = document.getElementById("skills-grid");
  for (const group of data.skills) {
    const card = el("div", null, "card skill-card");
    card.appendChild(el("h3", group.category, "skill-category"));
    const tags = el("ul", null, "tags");
    tags.setAttribute("role", "list");
    group.items.forEach((item) => tags.appendChild(el("li", item, "tag")));
    card.appendChild(tags);
    grid.appendChild(card);
  }
}

function renderProjects(data) {
  const grid = document.getElementById("projects-grid");
  for (const project of data.projects) {
    const card = el("article", null, "card project-card");
    const top = el("div", null, "project-top");
    top.appendChild(el("h3", project.title, "project-title"));
    if (project.subtitle) top.appendChild(el("span", project.subtitle, "project-status")); // e.g. "In Progress"
    card.appendChild(top);

    const ul = el("ul", null, "project-bullets");
    project.groups.forEach((g) => g.bullets.forEach((b) => ul.appendChild(el("li", b))));
    card.appendChild(ul);
    grid.appendChild(card);
  }
}

// ---------- Step 5: navigation behavior ----------

// Highlights the nav link for the section currently in the middle of the screen.
function setupScrollSpy() {
  const links = document.querySelectorAll(".nav-links a");
  const linkFor = {};
  links.forEach((a) => { linkFor[a.getAttribute("href").slice(1)] = a; });

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((a) => a.removeAttribute("aria-current"));
      linkFor[entry.target.id].setAttribute("aria-current", "location");
    }
  }, { rootMargin: "-50% 0px -50% 0px" }); // a thin line across the middle of the screen

  Object.keys(linkFor).forEach((id) => {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });
}

// On phones, the ☰ button opens and closes the link list.
function setupMenu() {
  const button = document.getElementById("nav-toggle");
  const list = document.getElementById("nav-links");
  const setOpen = (open) => {
    button.setAttribute("aria-expanded", String(open));
    list.classList.toggle("open", open);
  };
  button.addEventListener("click", () => setOpen(button.getAttribute("aria-expanded") !== "true"));
  list.addEventListener("click", (e) => { if (e.target.tagName === "A") setOpen(false); });
}

// ---------- Run it ----------

setupMenu();
setupScrollSpy();

loadSummary()
  .then((summary) => {
    const data = parseResume(summary);
    console.log("Parsed resume data:", data); // handy for checking the parser in DevTools
    renderNav(data);
    renderHero(data);
    renderAbout(data);
    renderWhatIDo(data);
    renderExperience(data);
    renderSkills(data);
    renderProjects(data);
  })
  .catch((error) => {
    const box = document.getElementById("load-error");
    box.hidden = false;
    box.textContent =
      "Couldn't load the resume content. If you opened this file by double-clicking it, " +
      "run a local server instead (python3 -m http.server, then open http://localhost:8000). Details: " + error.message;
    console.error(error);
  });
