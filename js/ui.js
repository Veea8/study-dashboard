// Small DOM helpers: escaping, modal, toasts.

export function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ---------- modal ---------- */

const modalRoot = () => document.getElementById("modal-root");

export function openModal(title, bodyHtml, footHtml = "") {
  const root = modalRoot();
  root.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" data-close title="Close">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ""}
    </div>`;
  root.hidden = false;
  root.onmousedown = (e) => {
    if (e.target === root) closeModal();
  };
  root.querySelector("[data-close]").onclick = closeModal;
  document.addEventListener("keydown", escListener);
  const first = root.querySelector("input, select, textarea, button:not([data-close])");
  if (first) first.focus();
  return root.querySelector(".modal");
}

function escListener(e) {
  if (e.key === "Escape") closeModal();
}

export function closeModal() {
  const root = modalRoot();
  root.hidden = true;
  root.innerHTML = "";
  document.removeEventListener("keydown", escListener);
}

/* ---------- toast ---------- */

export function toast(msg, kind = "") {
  const root = document.getElementById("toast-root");
  const t = el(`<div class="toast ${kind}">${esc(msg)}</div>`);
  root.appendChild(t);
  setTimeout(() => t.remove(), kind === "error" ? 6000 : 3200);
}
