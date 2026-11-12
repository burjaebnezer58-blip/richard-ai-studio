(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const resources = [
    ["video", "Video Script"], ["lessonplan", "Lesson Plan"], ["dlp", "Daily Lesson Plan"],
    ["notes", "Notes"], ["worksheet", "Worksheet"], ["qpaper", "Question Paper"],
    ["flashcards", "Flashcards"], ["rubric", "Rubric"], ["quiz", "Quiz"], ["slides", "Slide Outline"]
  ];
  const curricula = {
    "CBSE (India)": ["English", "Hindi", "Mathematics", "Science", "Social Science", "Computer Science", "Sanskrit", "Physical Education", "Other"],
    "ICSE / CISCE (India)": ["English Language", "English Literature", "Hindi", "Mathematics", "Physics", "Chemistry", "Biology", "History & Civics", "Geography", "Computer Applications", "Other"],
    "IGCSE (Cambridge)": ["English First Language", "English as a Second Language", "Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Global Perspectives", "Geography", "History", "Arabic", "Other"],
    "IB (PYP / MYP / DP)": ["Language & Literature", "Language Acquisition", "Mathematics", "Sciences", "Individuals & Societies", "Design", "Arts", "Physical & Health Education", "Theory of Knowledge", "Other"],
    "British (National Curriculum England)": ["English", "Maths", "Science", "Computing", "History", "Geography", "Art & Design", "Music", "Religious Education", "Modern Foreign Language", "Other"],
    "American (Common Core / State Standards)": ["English Language Arts", "Mathematics", "Science", "Social Studies", "Computer Science", "World Languages", "Health", "Other"],
    "Qatar National Curriculum (MoEHE)": ["Arabic Language", "Islamic Education", "English", "Mathematics", "Science", "Social Studies", "Computer Science", "Physical Education", "Other"],
    "Custom / Other": ["English", "Mathematics", "Science", "Social Studies", "Computer Science", "Languages", "Other"]
  };
  const state = { token: localStorage.getItem("studioToken") || "", user: null, projects: [], last: null, authMode: "login" };

  function status(message, kind = "") {
    const el = $("status");
    el.textContent = message;
    el.className = `status${kind ? ` ${kind}` : ""}`;
  }

  async function api(url, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(url, { ...options, headers });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function addOption(select, label, value = label) {
    select.add(new Option(label, value));
  }

  function setupForm() {
    Object.keys(curricula).forEach(name => addOption($("curriculum"), name));
    for (let grade = 1; grade <= 12; grade++) addOption($("grade"), `Class ${grade}`);
    renderSubjects();
    $("curriculum").addEventListener("change", renderSubjects);

    resources.forEach(([id, label], index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "type";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "resourceType";
      radio.id = `type-${id}`;
      radio.value = id;
      radio.checked = index === 0;
      const text = document.createElement("label");
      text.htmlFor = radio.id;
      text.textContent = label;
      wrapper.append(radio, text);
      $("types").appendChild(wrapper);
    });
  }

  function renderSubjects() {
    const select = $("subject");
    select.replaceChildren();
    (curricula[$("curriculum").value] || []).forEach(subject => addOption(select, subject));
  }

  function openAuth(mode) {
    state.authMode = mode;
    $("authModal").classList.add("open");
    $("authModal").setAttribute("aria-hidden", "false");
    $("authHeading").textContent = mode === "register" ? "Create your account" : "Welcome back";
    $("authSubmit").textContent = mode === "register" ? "Create account" : "Log in";
    $("nameField").classList.toggle("hidden", mode !== "register");
    $("authPassword").autocomplete = mode === "register" ? "new-password" : "current-password";
    document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.mode === mode));
    $("authEmail").focus();
  }

  function closeAuth() {
    $("authModal").classList.remove("open");
    $("authModal").setAttribute("aria-hidden", "true");
  }

  function renderAuth() {
    const loggedIn = Boolean(state.user && state.token);
    $("loginBtn").classList.toggle("hidden", loggedIn);
    $("registerBtn").classList.toggle("hidden", loggedIn);
    $("logoutBtn").classList.toggle("hidden", !loggedIn);
  }

  async function authenticate(event) {
    event.preventDefault();
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    const registering = state.authMode === "register";
    const payload = { email, password };
    if (registering) payload.name = $("authName").value.trim();
    try {
      const result = await api(registering ? "/api/register" : "/api/login", {
        method: "POST", body: JSON.stringify(payload)
      });
      state.token = result.token;
      state.user = result.user;
      localStorage.setItem("studioToken", state.token);
      closeAuth();
      renderAuth();
      status(`Signed in as ${state.user.name}.`, "success");
      await loadProjects();
    } catch (error) {
      status(error.message, "error");
    }
  }

  async function loadSession() {
    if (!state.token) return;
    try {
      const result = await api("/api/session");
      state.user = result.user;
      renderAuth();
      await loadProjects();
      status(`Welcome, ${state.user.name}.`);
    } catch {
      state.token = "";
      state.user = null;
      localStorage.removeItem("studioToken");
      renderAuth();
    }
  }

  function safeText(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value == null ? "" : String(value);
    return element;
  }

  function renderProjects() {
    const list = $("projects");
    list.replaceChildren();
    $("projectCount").textContent = String(state.projects.length);
    const today = new Date().toDateString();
    $("todayCount").textContent = String(state.projects.filter(p => new Date(p.date).toDateString() === today).length);
    if (!state.projects.length) {
      list.appendChild(safeText("p", "notice", state.token ? "No saved projects yet." : "Log in to view your saved projects."));
      return;
    }

    state.projects.forEach(project => {
      const row = document.createElement("article");
      row.className = "project";
      const info = document.createElement("div");
      info.append(safeText("div", "project-title", project.title), safeText("div", "project-date", new Date(project.date).toLocaleString()));
      const buttons = document.createElement("div");
      buttons.className = "project-buttons";
      const open = safeText("button", "mini", "Open");
      open.type = "button";
      open.addEventListener("click", () => {
        state.last = { title: project.title, text: project.text, type: project.type };
        $("output").textContent = project.text;
        setOutputActions(true);
        status("Opened saved project.", "success");
      });
      const remove = safeText("button", "mini delete", "Delete");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (!confirm(`Delete “${project.title}”?`)) return;
        try {
          await api(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
          state.projects = state.projects.filter(item => item.id !== project.id);
          renderProjects();
          status("Project deleted.", "success");
        } catch (error) { status(error.message, "error"); }
      });
      buttons.append(open, remove);
      row.append(info, buttons);
      list.appendChild(row);
    });
  }

  async function loadProjects() {
    if (!state.token) { state.projects = []; renderProjects(); return; }
    try {
      const result = await api("/api/projects");
      state.projects = result.projects || [];
      renderProjects();
    } catch (error) { status(error.message, "error"); }
  }

  function getOptions() {
    return {
      curriculum: $("curriculum").value, grade: $("grade").value, subject: $("subject").value,
      topic: $("topic").value.trim(), duration: Math.min(180, Math.max(5, Number($("duration").value) || 40)),
      count: Math.min(50, Math.max(1, Number($("count").value) || 10)), level: $("level").value,
      language: $("language").value, type: document.querySelector('input[name="resourceType"]:checked')?.value || "video",
      esl: $("esl").checked, qatar: $("qatar").checked, sdg: $("sdg").checked,
      exam: $("exam").checked, answers: $("answers").checked
    };
  }

  function makePrompt(o) {
    const base = `Curriculum: ${o.curriculum}\nClass: ${o.grade}\nSubject: ${o.subject}\nTopic: ${o.topic}\nDuration: ${o.duration} minutes\nLearner level: ${o.level}\nOutput language: ${o.language}\nFollow the selected curriculum's scope and sequence. If uncertain whether the topic belongs, state the uncertainty rather than inventing syllabus facts. Use clear headings and numbered sections.`;
    let extras = "";
    if (o.esl) extras += "\nInclude accessible ESL support: vocabulary, pronunciation help, sentence frames, and a glossary.";
    if (o.qatar) extras += "\nInclude Qatar National Values and one concrete classroom example.";
    if (o.sdg) extras += "\nLink relevant UN Sustainable Development Goals and name their numbers.";
    if (o.exam) extras += "\nAdd curriculum-appropriate exam-style questions with mark allocations.";
    if (o.answers) extras += "\nInclude a complete answer key at the end.";
    const templates = {
      video: `Create a video lesson script. Include title, objectives, timed scenes, narration, on-screen text, visual suggestions, recap, ${o.count} practice questions, and teacher notes.`,
      lessonplan: "Create a lesson plan with objectives, success criteria, prior knowledge, warm-up, timed activities, differentiation, resources, assessment, homework, and reflection prompts.",
      dlp: "Create a Daily Lesson Plan with objectives, outcomes, prior knowledge, teaching strategies, teacher/student activities, integration, assessment, differentiation, and reflection.",
      notes: `Create student-friendly notes with definitions, explanations, examples, diagram descriptions, ${o.count} questions, and a revision summary.`,
      worksheet: `Create a printable worksheet with ${o.count} varied questions, clear instructions, and answer space markers.`,
      qpaper: `Create a question paper with a class/subject/time header, ${o.count} total questions, marks, mark distribution, and marking scheme.`,
      flashcards: `Create ${o.count} flashcards formatted as number | front | back | example.`,
      rubric: "Create a rubric with 4–5 criteria and four performance levels with descriptors and marks.",
      quiz: `Create a ${o.count}-question quiz mixing MCQs and true/false, with answers and short explanations.`,
      slides: `Create a slide-by-slide presentation outline of about ${Math.max(5, Math.round(o.duration / 4))} slides with titles, 3–5 bullets, speaker notes, and suggested visuals.`
    };
    return `${templates[o.type] || templates.video}\n\n${base}${extras}`;
  }

  function setOutputActions(enabled) {
    ["copyBtn", "saveBtn", "docBtn", "printBtn"].forEach(id => { $(id).disabled = !enabled; });
  }

  async function generate() {
    if (!state.token) { openAuth("login"); status("Log in to generate content.", "error"); return; }
    const options = getOptions();
    if (!options.topic) { status("Enter a chapter or topic first.", "error"); $("topic").focus(); return; }
    const button = $("generateBtn");
    button.disabled = true;
    setOutputActions(false);
    status("Generating your resource. This may take a little while.");
    $("output").textContent = "";
    try {
      const result = await api("/api/generate", { method: "POST", body: JSON.stringify({ prompt: makePrompt(options) }) });
      state.last = { title: `${resources.find(item => item[0] === options.type)[1]} - ${options.subject} ${options.grade} - ${options.topic}`, text: result.text, type: options.type };
      $("output").textContent = result.text;
      setOutputActions(true);
      status("Generation complete. Copy, save, or export your resource.", "success");
    } catch (error) { status(error.message, "error"); }
    finally { button.disabled = false; }
  }

  async function saveProject() {
    if (!state.last || !state.token) return status("Log in and generate content before saving.", "error");
    try {
      const result = await api("/api/projects", { method: "POST", body: JSON.stringify(state.last) });
      state.projects.unshift(result.project);
      renderProjects();
      status("Project saved to your library.", "success");
    } catch (error) { status(error.message, "error"); }
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function downloadWord() {
    if (!state.last) return;
    const doc = `<html><head><meta charset="utf-8"></head><body><h2>${escapeHtml(state.last.title)}</h2><pre style="white-space:pre-wrap;font-family:Calibri,Arial">${escapeHtml(state.last.text)}</pre></body></html>`;
    const blob = new Blob([doc], { type: "application/msword" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${state.last.title.replace(/[^\w -]/g, "").slice(0, 80) || "resource"}.doc`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function printOutput() {
    if (!state.last) return;
    const win = window.open("", "_blank");
    if (!win) return status("Allow pop-ups to print or save as PDF.", "error");
    win.document.write(`<title>${escapeHtml(state.last.title)}</title><style>body{font-family:Arial;padding:24px;line-height:1.5}pre{white-space:pre-wrap}</style><h2>${escapeHtml(state.last.title)}</h2><pre>${escapeHtml(state.last.text)}</pre>`);
    win.document.close();
    win.focus();
    win.print();
  }

  function bindEvents() {
    $("loginBtn").addEventListener("click", () => openAuth("login"));
    $("registerBtn").addEventListener("click", () => openAuth("register"));
    $("logoutBtn").addEventListener("click", () => {
      state.token = ""; state.user = null; state.projects = []; state.last = null;
      localStorage.removeItem("studioToken"); renderAuth(); renderProjects(); setOutputActions(false);
      $("output").textContent = "Your generated content will appear here.";
      status("You have logged out.");
    });
    $("closeModal").addEventListener("click", () => { $("authModal").classList.remove("open"); $("authModal").setAttribute("aria-hidden", "true"); });
    $("authModal").addEventListener("click", event => { if (event.target === $("authModal")) { $("authModal").classList.remove("open"); $("authModal").setAttribute("aria-hidden", "true"); } });
    document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => openAuth(tab.dataset.mode)));
    $("authForm").addEventListener("submit", authenticate);
    $("generateBtn").addEventListener("click", generate);
    $("saveBtn").addEventListener("click", saveProject);
    $("refreshBtn").addEventListener("click", loadProjects);
    $("copyBtn").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(state.last.text); status("Copied to clipboard.", "success"); }
      catch { status("Clipboard access failed. Select and copy the text manually.", "error"); }
    });
    $("docBtn").addEventListener("click", downloadWord);
    $("printBtn").addEventListener("click", printOutput);
    $("resetBtn").addEventListener("click", () => {
      $("topic").value = ""; $("duration").value = "40"; $("count").value = "10";
      $("level").value = "Intermediate"; $("language").value = "English";
      $("esl").checked = false; $("qatar").checked = true; $("sdg").checked = true;
      $("exam").checked = false; $("answers").checked = true;
      document.querySelector('input[name="resourceType"]').checked = true;
      state.last = null; $("output").textContent = "Your generated content will appear here.";
      setOutputActions(false); status("Form reset.");
    });
  }

  setupForm();
  bindEvents();
  renderAuth();
  renderProjects();
  setOutputActions(false);
  loadSession();
})();
