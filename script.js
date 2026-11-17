// script.js
// Loads resume.md, keeps ONLY the Website Summary part, and fills in the page.
// The AI Details part is cut off and never displayed.

const START_MARKER = "<!-- WEBSITE-SUMMARY-START -->";
const END_MARKER = "<!-- WEBSITE-SUMMARY-END -->";

// Which resume.md heading goes into which <section> in index.html.
const SECTION_IDS = {
  "summary": "summary",
  "professional experience": "experience",
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
  return fullText.slice(start + START_MARKER.length, end);
}

// ---------- Step 2: turn each line into a simple "block" ----------

function parseLines(text) {
  const blocks = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
    } else if (line.startsWith("- ")) {
      blocks.push({ type: "bullet", text: line.slice(2) });
    } else if (/^\*\*[^*]+\*\*$/.test(line)) {
      blocks.push({ type: "group", text: line.slice(2, -2) }); // a whole line in **bold**
    } else {
      blocks.push({ type: "text", text: line });
    }
  }
  return blocks;
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
      node.appendChild(el("strong", part));
    } else {
      node.appendChild(document.createTextNode(part));
    }
  });
}

// "linkedin.com/in/x" -> clickable link. Anything else stays plain text.
function contactItem(item) {
  if (/^[\w-]+\.(com|org|net|io|dev)\//.test(item)) {
    const link = el("a", item);
    link.href = "https://" + item;
    link.target = "_blank";
    link.rel = "noopener";
    return link;
  }
  return el("span", item);
}

// ---------- Step 4: put the blocks onto the page ----------

function render(blocks) {
  let section = null;  // the <section> we're currently filling
  let entry = null;    // the current job/project inside it
  let list = null;     // the current <ul>, if we're in a run of bullets
  let lastWasEntryHeading = false;
  let headerLines = 0; // plain lines right after the name: tagline, then contact

  for (const block of blocks) {
    const container = entry || section;

    // Name (# heading) and the lines right under it go in the header.
    if (block.type === "heading" && block.level === 1) {
      document.getElementById("name").textContent = block.text;
      document.title = block.text + " | Resume";
      headerLines = 1;
      continue;
    }
    if (headerLines > 0 && block.type === "text" && !section) {
      if (headerLines === 1) {
        document.getElementById("tagline").textContent = block.text;
      } else {
        const contact = document.getElementById("contact");
        block.text.split(" | ").forEach((item, i) => {
          if (i > 0) contact.appendChild(el("span", "|", "sep"));
          contact.appendChild(contactItem(item.trim()));
        });
      }
      headerLines++;
      continue;
    }

    if (block.type === "heading") {
      const sectionId = SECTION_IDS[block.text.toLowerCase()];
      if (sectionId) {
        // Start a new main section.
        section = document.getElementById(sectionId);
        section.appendChild(el("h2", block.text));
        entry = null;
      } else if (section) {
        // A job or project inside the section: "Company | Role"
        entry = el("article", null, "entry");
        const [company, ...rest] = block.text.split(" | ");
        const h3 = el("h3", company);
        if (rest.length) h3.appendChild(el("span", " · " + rest.join(" · "), "role"));
        entry.appendChild(h3);
        section.appendChild(entry);
        lastWasEntryHeading = true;
        list = null;
        continue;
      } else {
        console.warn("Heading not placed on the page:", block.text);
      }
      list = null;
      lastWasEntryHeading = false;
      continue;
    }

    if (!container) {
      console.warn("Line not placed on the page:", block.text);
      continue;
    }

    if (block.type === "bullet") {
      if (!list) {
        list = el("ul");
        container.appendChild(list);
      }
      list.appendChild(buildBullet(block.text, section));
    } else if (block.type === "group") {
      container.appendChild(el("h4", block.text, "group"));
      list = null;
    } else {
      // Plain text right under a job heading is its location/dates line.
      container.appendChild(el("p", block.text, lastWasEntryHeading ? "meta" : null));
      list = null;
    }
    lastWasEntryHeading = false;
  }
}

// In the Skills section, "**Label:** a, b, c" becomes a label plus tags.
function buildBullet(text, section) {
  const skill = text.match(/^\*\*(.+?)\*\*\s*(.*)$/);
  if (section && section.id === "skills" && skill) {
    const li = el("li");
    li.appendChild(el("strong", skill[1].replace(/:$/, "")));
    skill[2].split(",").forEach((s) => li.appendChild(el("span", s.trim(), "tag")));
    return li;
  }
  return el("li", text);
}

// ---------- Run it ----------

loadSummary()
  .then((summary) => render(parseLines(summary)))
  .catch((error) => {
    const box = document.getElementById("load-error");
    box.hidden = false;
    box.textContent =
      "Couldn't load the resume content. If you opened this file by double-clicking it, " +
      "run a local server instead (python3 -m http.server, then open http://localhost:8000). Details: " + error.message;
    console.error(error);
  });
