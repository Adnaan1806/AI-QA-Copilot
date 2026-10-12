const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
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

async function send(path, { method = "GET", json, body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : body,
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
  return response;
}

async function request(path, options) {
  const response = await send(path, options);
  return response.status === 204 ? null : response.json();
}

async function download(path, filename) {
  const blob = await (await send(path)).blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Auth

export async function register({ email, password, name }) {
  const data = await request("/auth/register", {
    method: "POST",
    json: { email, password, name },
  });
  setToken(data.access_token);
  return data;
}

export async function login({ email, password }) {
  const data = await request("/auth/login", { method: "POST", json: { email, password } });
  setToken(data.access_token);
  return data;
}

export function getCurrentUser() {
  return request("/auth/me");
}

// Projects

export function listProjects() {
  return request("/projects");
}

export function createProject({ name, description, base_url }) {
  return request("/projects", { method: "POST", json: { name, description, base_url } });
}

export function getProject(projectId) {
  return request(`/projects/${projectId}`);
}

export function updateProject(projectId, patch) {
  return request(`/projects/${projectId}`, { method: "PATCH", json: patch });
}

// Test suites

export function listTestSuites(projectId) {
  return request(`/projects/${projectId}/test-suites`);
}

export function createTestSuite(projectId, { name, description }) {
  return request(`/projects/${projectId}/test-suites`, {
    method: "POST",
    json: { name, description },
  });
}

export function getTestSuite(suiteId) {
  return request(`/test-suites/${suiteId}`);
}

// Requirements

export function createRequirement(suiteId, { text, file }) {
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  } else {
    formData.append("text", text);
  }
  return request(`/test-suites/${suiteId}/requirements`, { method: "POST", body: formData });
}

export function listRequirements() {
  return request("/requirements");
}

export function getRequirement(requirementId) {
  return request(`/requirements/${requirementId}`);
}

export function updateRequirementName(requirementId, name) {
  return request(`/requirements/${requirementId}`, { method: "PATCH", json: { name } });
}

export function generateAutomationAndReport(requirementId) {
  return request(`/requirements/${requirementId}/automation`, { method: "POST" });
}

export function getAutomationProgress(requirementId) {
  return request(`/requirements/${requirementId}/automation/progress`);
}

export function exportTestCases(requirementId) {
  return download(
    `/requirements/${requirementId}/test-cases/export`,
    `test-cases-${requirementId}.xlsx`,
  );
}

export function approveAllTestCases(requirementId) {
  return request(`/requirements/${requirementId}/test-cases/approve-all`, { method: "POST" });
}

// Test cases

export function createTestCase(requirementId, testCase) {
  return request(`/requirements/${requirementId}/test-cases`, { method: "POST", json: testCase });
}

export function updateTestCase(testCaseId, patch) {
  return request(`/test-cases/${testCaseId}`, { method: "PATCH", json: patch });
}

export async function deleteTestCase(testCaseId) {
  await request(`/test-cases/${testCaseId}`, { method: "DELETE" });
}

export function rerunTestCaseAutomation(testCaseId) {
  return request(`/test-cases/${testCaseId}/automation`, { method: "POST" });
}

export function getTestCaseTries(testCaseId) {
  return request(`/test-cases/${testCaseId}/tries`);
}

export function downloadTestCaseTrace(testCaseId) {
  return download(`/test-cases/${testCaseId}/trace`, `trace-${testCaseId}.zip`);
}

// Project knowledge

export function listKnowledge(projectId) {
  return request(`/projects/${projectId}/knowledge`);
}

export function uploadKnowledge(projectId, { name, text, file }) {
  const formData = new FormData();
  if (name) formData.append("source_name", name);
  if (file) {
    formData.append("file", file);
  } else {
    formData.append("text", text);
  }
  return request(`/projects/${projectId}/knowledge`, { method: "POST", body: formData });
}

export function deleteKnowledge(projectId, documentId) {
  return request(`/projects/${projectId}/knowledge/${documentId}`, { method: "DELETE" });
}

export function searchKnowledge(projectId, query) {
  return request(`/projects/${projectId}/knowledge/search`, { method: "POST", json: { query } });
}

// App map

export function getAppMap(projectId) {
  return request(`/projects/${projectId}/app-map`);
}

export function crawlApp(projectId) {
  return request(`/projects/${projectId}/app-map/crawl`, { method: "POST" });
}

export function updateCrawlSettings(projectId, settings) {
  return request(`/projects/${projectId}/app-map`, { method: "PATCH", json: settings });
}

export function getFact(projectId, factId) {
  return request(`/projects/${projectId}/facts/${factId}`);
}

export function listFacts(projectId, kind) {
  return request(`/projects/${projectId}/facts?kind=${encodeURIComponent(kind)}`);
}

// A business rule ({kind: "rule", text}) or glossary term ({kind: "term", term, meaning}).
export function createFact(projectId, fact) {
  return request(`/projects/${projectId}/facts`, { method: "POST", json: fact });
}

export function updateFact(projectId, factId, patch) {
  return request(`/projects/${projectId}/facts/${factId}`, { method: "PATCH", json: patch });
}

export function deleteFact(projectId, factId) {
  return request(`/projects/${projectId}/facts/${factId}`, { method: "DELETE" });
}

// Accounts (logins to the project's app)

export function listAccounts(projectId) {
  return request(`/projects/${projectId}/accounts`);
}

export function createAccount(projectId, account) {
  return request(`/projects/${projectId}/accounts`, { method: "POST", json: account });
}

export function updateAccount(projectId, accountId, patch) {
  return request(`/projects/${projectId}/accounts/${accountId}`, { method: "PATCH", json: patch });
}

export function deleteAccount(projectId, accountId) {
  return request(`/projects/${projectId}/accounts/${accountId}`, { method: "DELETE" });
}

export function checkAccountLogin(projectId, accountId) {
  return request(`/projects/${projectId}/accounts/${accountId}/login`, { method: "POST" });
}
