// Thin Microsoft Graph client for the To Do endpoints.

import { getToken } from "./auth.js";

const BASE = "https://graph.microsoft.com/v1.0";

async function call(method, path, body) {
  const token = await getToken();
  const url = path.startsWith("https://") ? path : BASE + path;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    const err = new Error(`Graph ${method} ${path} → ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function getAll(path) {
  const items = [];
  let next = path;
  while (next) {
    const page = await call("GET", next);
    items.push(...(page.value ?? []));
    next = page["@odata.nextLink"] || null;
  }
  return items;
}

export const graph = {
  getLists: () => getAll("/me/todo/lists"),
  createList: (displayName) => call("POST", "/me/todo/lists", { displayName }),

  // $expand pulls checklist items in the same request.
  getTasks: (listId) =>
    getAll(`/me/todo/lists/${listId}/tasks?$expand=checklistItems&$top=100`),
  createTask: (listId, payload) =>
    call("POST", `/me/todo/lists/${listId}/tasks`, payload),
  updateTask: (listId, taskId, payload) =>
    call("PATCH", `/me/todo/lists/${listId}/tasks/${taskId}`, payload),
  deleteTask: (listId, taskId) =>
    call("DELETE", `/me/todo/lists/${listId}/tasks/${taskId}`),

  createChecklistItem: (listId, taskId, payload) =>
    call("POST", `/me/todo/lists/${listId}/tasks/${taskId}/checklistItems`, payload),
  updateChecklistItem: (listId, taskId, itemId, payload) =>
    call("PATCH", `/me/todo/lists/${listId}/tasks/${taskId}/checklistItems/${itemId}`, payload),
  deleteChecklistItem: (listId, taskId, itemId) =>
    call("DELETE", `/me/todo/lists/${listId}/tasks/${taskId}/checklistItems/${itemId}`),
};
