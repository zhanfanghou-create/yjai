#!/usr/bin/env node
import { createReadStream, statSync } from "node:fs";
import path from "node:path";

const apiBase = "https://api.cnb.cool";
const token = process.env.CNB_TOKEN;
const repository = process.env.CNB_REPOSITORY;
const tag = process.env.CNB_RELEASE_TAG;
const title = process.env.CNB_RELEASE_TITLE || tag;
const notes = process.env.CNB_RELEASE_NOTES || title;
const files = process.argv.slice(2);

if (!token || !repository || !tag || files.length === 0) {
  throw new Error("CNB_TOKEN, CNB_REPOSITORY, CNB_RELEASE_TAG and at least one asset are required");
}

const headers = {
  Accept: "application/vnd.cnb.api+json",
  Authorization: `Bearer ${token}`,
};

async function apiRequest(route, init = {}) {
  const response = await fetch(`${apiBase}/${repository}${route}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
    redirect: "follow",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`CNB API ${response.status}: ${detail || response.statusText}`);
  }
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("json") ? response.json() : response.text();
}

async function ensureRelease() {
  const encodedTag = encodeURIComponent(tag);
  try {
    const release = await apiRequest(`/-/releases/tags/${encodedTag}`);
    return apiRequest(`/-/releases/${release.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: title, body: notes, draft: false, prerelease: false, make_latest: "true" }),
    });
  } catch (error) {
    if (!String(error.message).includes(" 404:")) throw error;
    return apiRequest("/-/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: "main",
        name: title,
        body: notes,
        draft: false,
        prerelease: false,
        make_latest: "true",
      }),
    });
  }
}

async function uploadAsset(release, filePath) {
  const size = statSync(filePath).size;
  const assetName = path.basename(filePath);
  const upload = await apiRequest(`/-/releases/${release.id}/asset-upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset_name: assetName, overwrite: true, size, ttl: 0 }),
  });
  const response = await fetch(upload.upload_url, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream", "Content-Length": String(size) },
    body: createReadStream(filePath),
    duplex: "half",
  });
  if (!response.ok) throw new Error(`CNB asset upload ${response.status}: ${await response.text().catch(() => "")}`);
  const verifyUrl = new URL(upload.verify_url, apiBase);
  if (!verifyUrl.searchParams.has("ttl")) verifyUrl.searchParams.set("ttl", "0");
  const confirmation = await fetch(verifyUrl, { method: "POST", headers });
  if (!confirmation.ok) throw new Error(`CNB asset confirmation ${confirmation.status}: ${await confirmation.text().catch(() => "")}`);
  console.log(`CNB asset published: ${assetName} (${size} bytes)`);
}

const release = await ensureRelease();
console.log("[CNB DEBUG] release object:", JSON.stringify(release, null, 2));
console.log("[CNB DEBUG] release.id:", release?.id, "type:", typeof release?.id);
console.log("[CNB DEBUG] release.tag_name:", release?.tag_name);
for (const filePath of files) await uploadAsset(release, filePath);
console.log(`CNB release published: ${repository}@${tag}`);
