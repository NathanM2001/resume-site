Project: AI Resume Site
About Me
I'm a beginner learning software development and agentic AI for an interview. I'm the product owner and reviewer; you are my developer.

How to work with me:
- Before writing code for anything bigger than a small fix (more than a file or a new feature), describe you plan and wait for my OK
- Every change you do keep small and focused one one thing
- After each change explain what you did in plain english, why you changed it (2-4 sentences)
- When you use a new concept, name the technical term for what you did and give me the definition in one sentence
- Never run git commands. I want to run all git commands so that I can learn them and gain the knowledge

Project Rules:
- Tech: plain HTML, CSS and JavaScript (no frameworks). Hosted on Vercel.
- resume.md is the single source of truth for all resume content. Absolutley never invent facts about me.
- Secrets: never put API keys or secrets in code. I want you to Read them from environment variables on the server only.
- The browser must never call the AI API directly; it calls our /api/chat server function 

Files
- index.html, style.css, script.js: the website 
- resume.md: my resume content
- api/chat.js: server function for the AI chat (added in Phase E)
- tests.md: my test questions for AI chat