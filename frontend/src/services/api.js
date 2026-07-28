const API_BASE_URL = "http://localhost:8000";
const TOKEN_KEY = "qa_copilot_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(extra = {}) {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function handleResponse(response) {
  if (response.status === 401) {
    clearToken();
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new Error("Session expired, please log in again.");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Request failed with status ${response.status}`);
  }
  return response.json();
}

// Auth

export async function register({ email, password, name }) {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  const data = await handleResponse(response);
  setToken(data.access_token);
  return data;
}

export async function login({ email, password }) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await handleResponse(response);
  setToken(data.access_token);
  return data;
}

export async function getCurrentUser() {
  const response = await fetch(`${API_BASE_URL}/auth/me`, { headers: authHeaders() });
  return handleResponse(response);
}

// Projects

export async function listProjects() {
  const response = await fetch(`${API_BASE_URL}/projects`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function createProject({ name, description, base_url }) {
  const response = await fetch(`${API_BASE_URL}/projects`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name, description, base_url }),
  });
  return handleResponse(response);
}

export async function getProject(projectId) {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function updateProject(projectId, patch) {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(patch),
  });
  return handleResponse(response);
}

// Test suites

export async function listTestSuites(projectId) {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/test-suites`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function createTestSuite(projectId, { name, description }) {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/test-suites`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name, description }),
  });
  return handleResponse(response);
}

export async function getTestSuite(suiteId) {
  const response = await fetch(`${API_BASE_URL}/test-suites/${suiteId}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

// Requirements

export async function createRequirement(suiteId, { text, file }) {
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  } else {
    formData.append("text", text);
  }

  const response = await fetch(`${API_BASE_URL}/test-suites/${suiteId}/requirements`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  return handleResponse(response);
}

export async function listRequirements() {
  const response = await fetch(`${API_BASE_URL}/requirements`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function getRequirement(requirementId) {
  const response = await fetch(`${API_BASE_URL}/requirements/${requirementId}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function updateRequirementName(requirementId, name) {
  const response = await fetch(`${API_BASE_URL}/requirements/${requirementId}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name }),
  });
  return handleResponse(response);
}

export async function generateAutomationAndReport(requirementId) {
  const response = await fetch(`${API_BASE_URL}/requirements/${requirementId}/automation`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function exportTestCases(requirementId) {
  const response = await fetch(
    `${API_BASE_URL}/requirements/${requirementId}/test-cases/export`,
    { headers: authHeaders() },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Request failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `test-cases-${requirementId}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function approveAllTestCases(requirementId) {
  const response = await fetch(
    `${API_BASE_URL}/requirements/${requirementId}/test-cases/approve-all`,
    { method: "POST", headers: authHeaders() },
  );
  return handleResponse(response);
}

// Test cases

export async function updateTestCase(testCaseId, patch) {
  const response = await fetch(`${API_BASE_URL}/test-cases/${testCaseId}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(patch),
  });
  return handleResponse(response);
}

export async function deleteTestCase(testCaseId) {
  const response = await fetch(`${API_BASE_URL}/test-cases/${testCaseId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (response.status === 401) {
    clearToken();
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new Error("Session expired, please log in again.");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Request failed with status ${response.status}`);
  }
}
