(() => {
  "use strict";

  const STORAGE_KEY = "markdown-notes-data";

  let notes = loadNotes();
  let activeId = notes[0]?.id || null;
  let saveTimer = null;

  const notesList = document.getElementById("notesList");
  const searchInput = document.getElementById("searchInput");
  const editorEmpty = document.getElementById("editorEmpty");
  const editorWrap = document.getElementById("editorWrap");
  const titleInput = document.getElementById("noteTitleInput");
  const contentInput = document.getElementById("noteContentInput");
  const preview = document.getElementById("notePreview");
  const autosaveStatus = document.getElementById("autosaveStatus");

  function loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

  function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getActiveNote() {
    return notes.find((n) => n.id === activeId) || null;
  }

  /* ---------- Markdown parser (simples, sem dependências) ---------- */
  function renderMarkdown(md) {
    if (!md) return "";
    let html = escapeHtml(md);

    // Blocos de código ```...```
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);

    const lines = html.split("\n");
    const out = [];
    let inList = false;

    for (let line of lines) {
      if (/^###\s+(.*)/.test(line)) {
        closeList();
        out.push(line.replace(/^###\s+(.*)/, "<h3>$1</h3>"));
        continue;
      }
      if (/^##\s+(.*)/.test(line)) {
        closeList();
        out.push(line.replace(/^##\s+(.*)/, "<h2>$1</h2>"));
        continue;
      }
      if (/^#\s+(.*)/.test(line)) {
        closeList();
        out.push(line.replace(/^#\s+(.*)/, "<h1>$1</h1>"));
        continue;
      }
      if (/^>\s?(.*)/.test(line)) {
        closeList();
        out.push(line.replace(/^>\s?(.*)/, "<blockquote>$1</blockquote>"));
        continue;
      }
      if (/^[-*]\s+(.*)/.test(line)) {
        if (!inList) {
          out.push("<ul>");
          inList = true;
        }
        out.push(line.replace(/^[-*]\s+(.*)/, "<li>$1</li>"));
        continue;
      }
      closeList();
      if (line.trim() === "") {
        out.push("");
      } else if (line.startsWith("<pre>") || line.startsWith("</pre>") || line.includes("<pre><code>")) {
        out.push(line);
      } else {
        out.push(`<p>${line}</p>`);
      }
    }
    closeList();

    function closeList() {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
    }

    html = out.join("\n");

    // Inline: negrito, itálico, código, links
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    html = html.replace(/`([^`]+?)`/g, "<code>$1</code>");
    html = html.replace(
      /\[(.+?)\]\(([^[\]]+)\)/g,
      (_, text, url) => `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`
    );

    return html;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function sanitizeUrl(url) {
    const trimmed = url.trim();
    if (/^(https?:|mailto:|#|\/)/i.test(trimmed)) return trimmed.replace(/"/g, "&quot;");
    return "#";
  }

  /* ---------- Render lista de notas ---------- */
  function renderList() {
    const term = searchInput.value.trim().toLowerCase();
    const filtered = notes
      .filter((n) => n.title.toLowerCase().includes(term) || n.content.toLowerCase().includes(term))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (filtered.length === 0) {
      notesList.innerHTML = `<li class="notes-empty">${notes.length === 0 ? "Nenhuma nota ainda. Crie a primeira!" : "Nenhuma nota encontrada."}</li>`;
      return;
    }

    notesList.innerHTML = filtered
      .map(
        (n) => `
      <li class="note-item ${n.id === activeId ? "is-active" : ""}" data-id="${n.id}">
        <p class="note-item__title">${escapeHtml(n.title || "Sem título")}</p>
        <p class="note-item__preview">${escapeHtml(n.content.slice(0, 60) || "Nota vazia")}</p>
        <span class="note-item__date">${formatDate(n.updatedAt)}</span>
      </li>`
      )
      .join("");

    notesList.querySelectorAll(".note-item").forEach((li) => {
      li.addEventListener("click", () => {
        activeId = li.dataset.id;
        renderList();
        renderEditor();
      });
    });
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  /* ---------- Render editor ---------- */
  function renderEditor() {
    const note = getActiveNote();
    if (!note) {
      editorEmpty.hidden = false;
      editorWrap.hidden = true;
      return;
    }
    editorEmpty.hidden = true;
    editorWrap.hidden = false;
    titleInput.value = note.title;
    contentInput.value = note.content;
    preview.innerHTML = renderMarkdown(note.content);
    autosaveStatus.textContent = `Salvo automaticamente às ${formatDate(note.updatedAt)}`;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const note = getActiveNote();
      if (!note) return;
      note.title = titleInput.value.trim() || "Sem título";
      note.content = contentInput.value;
      note.updatedAt = Date.now();
      persist();
      renderList();
      autosaveStatus.textContent = `Salvo automaticamente às ${formatDate(note.updatedAt)}`;
    }, 400);
  }

  titleInput.addEventListener("input", () => {
    preview.innerHTML = renderMarkdown(contentInput.value);
    scheduleSave();
  });
  contentInput.addEventListener("input", () => {
    preview.innerHTML = renderMarkdown(contentInput.value);
    scheduleSave();
  });

  /* ---------- Nova nota / excluir ---------- */
  document.getElementById("newNoteBtn").addEventListener("click", () => {
    const note = { id: uid(), title: "Nova nota", content: "", updatedAt: Date.now() };
    notes.push(note);
    activeId = note.id;
    persist();
    renderList();
    renderEditor();
    titleInput.focus();
    titleInput.select();
  });

  document.getElementById("deleteNoteBtn").addEventListener("click", () => {
    const note = getActiveNote();
    if (!note) return;
    if (!confirm(`Excluir a nota "${note.title}"? Essa ação não pode ser desfeita.`)) return;
    notes = notes.filter((n) => n.id !== note.id);
    activeId = notes[0]?.id || null;
    persist();
    renderList();
    renderEditor();
  });

  searchInput.addEventListener("input", renderList);

  /* ---------- Tabs (mobile) ---------- */
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => {
        b.classList.remove("is-active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");

      const tab = btn.dataset.tab;
      contentInput.classList.toggle("is-active", tab === "edit");
      preview.classList.toggle("is-active", tab === "preview");
    });
  });

  /* ---------- Init ---------- */
  if (notes.length === 0) {
    notes.push({
      id: uid(),
      title: "Bem-vindo(a) 👋",
      content:
        "# Bem-vindo ao Markdown Notes\n\nEste é um editor de notas com suporte a **Markdown**.\n\n- Use `#`, `##`, `###` para títulos\n- **negrito** e *itálico*\n- Links: [exemplo](https://exemplo.com)\n- Código inline: `console.log(1)`\n\n> Suas notas são salvas automaticamente no navegador.\n\n```\nfunction ola() {\n  return \"mundo\";\n}\n```",
      updatedAt: Date.now(),
    });
    activeId = notes[0].id;
    persist();
  }

  renderList();
  renderEditor();
})();
