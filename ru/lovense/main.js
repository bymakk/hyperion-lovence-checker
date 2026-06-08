const DEBUG = false;
const DPI_THR_BYTES = 64 * 1024;
const MAX_URI_X_SIZE = 7 * 1024;
const RIPE_API_URL = "https://stat.ripe.net/data/";

const ALIVE_KEY = "alive";
const ALIVE_NO = 0;
const ALIVE_YES = 1;
const ALIVE_UNKNOWN = 2;

const DPI_METHOD_KEY = "dpi";
const DPI_METHOD_NOT_DETECTED = 0;
const DPI_METHOD_DETECTED = 1;
const DPI_METHOD_PROBABLY = 2;
const DPI_METHOD_POSSIBLE = 3;
const DPI_METHOD_UNLIKELY = 4;

const TIER_CRITICAL = "critical";
const TIER_IMPORTANT = "important";
const TIER_OPTIONAL = "optional";
const TIER_LOCAL = "local";
const TIER_META = "meta";

const WORK_OK = "ok";
const WORK_WARN = "warn";
const WORK_FAIL = "fail";
const WORK_NA = "na";

const TIER_LABELS = {
  [TIER_CRITICAL]: "Критично",
  [TIER_IMPORTANT]: "Важно",
  [TIER_OPTIONAL]: "Необязательно",
  [TIER_LOCAL]: "Локально",
  [TIER_META]: "Служебный",
};

const WORK_LABELS = {
  [WORK_OK]: "Работает",
  [WORK_WARN]: "Под вопросом",
  [WORK_FAIL]: "Не работает",
  [WORK_NA]: "Не влияет",
};

const TIER_CELL_CLASS = {
  [TIER_CRITICAL]: "tier-cell-critical",
  [TIER_IMPORTANT]: "tier-cell-important",
  [TIER_OPTIONAL]: "tier-cell-optional",
  [TIER_LOCAL]: "tier-cell-local",
  [TIER_META]: "tier-cell-meta",
};

let testSuite = []; // Fetched from ./suite.v2.json
let timeoutMs = 15000;
let clientAsn = 0;
let resultItems = {};

const getParamsHandler = () => {
  const params = new URLSearchParams(window.location.search);

  const host = params.get("host");
  if (host) {
    const provider = params.get("provider") || "Custom";
    const newTest = { id: `CUSTOM-01`, provider, host, country: "💡" };
    testSuite.push(newTest);
  }

  timeoutMs = parseInt(params.get("timeout")) || timeoutMs;
};

const getDefaultFetchOpt = (ctrl, method = "GET",) => ({
  method,
  mode: "no-cors",
  referrer: "",
  credentials: "omit",
  cache: "no-store",
  signal: ctrl.signal,
  redirect: "follow",
  // The body size for keepalive requests is limited to 64 kibibytes.
  // https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#keepalive
  keepalive: false
});

const headerEl = document.getElementById("header");
const startButtonEl = document.getElementById("start-btn");
const shareButtonEl = document.getElementById("share-btn");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const resultsEl = document.getElementById("results");
const resultsBodyEl = document.getElementById("results-body");
const tableWrapEl = document.getElementById("table-wrap");
const shareTsEl = document.getElementById("shareTs");
const asnEl = document.getElementById("asn");
const verdictEl = document.getElementById("verdict");
const verdictIconEl = document.getElementById("verdict-icon");
const verdictTitleEl = document.getElementById("verdict-title");
const verdictTextEl = document.getElementById("verdict-text");
const verdictDetailsEl = document.getElementById("verdict-details");

const toggleUI = (locked) => {
  shareButtonEl.disabled = locked;
  startButtonEl.disabled = locked;
  startButtonEl.textContent = locked ? "🔍 ..." : "🔍 Start";
  statusEl.className = locked ? "status-checking" : "status-ready";
};

const setStatus = (col, text, cls) => {
  col.textContent = text;
  col.className = cls;
  if (cls === "bad") statusEl.className = "status-error";
};

const logPush = (level, prefix, msg) => {
  const now = new Date();
  const ts = now.toLocaleTimeString([], { hour12: false }) + "." + now.getMilliseconds().toString().padStart(3, "0");
  logEl.textContent += `[${ts}] ${prefix ? prefix + "/" : ""}${level}: ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
};

const timeElapsed = t0 => `${(performance.now() - t0).toFixed(1)} ms`;
const getHttpStatus = id => httpCodes[id];

const getUniqueUrl = url => {
  return url.includes('?') ? `${url}&t=${Math.random()}` : `${url}?t=${Math.random()}`;
};

const buildProbeUrl = (host, probePath, extraQuery = "") => {
  let url = `https://${host}${probePath || "/"}`;
  if (extraQuery) {
    url += url.includes("?") ? `&${extraQuery}` : `?${extraQuery}`;
  }
  return getUniqueUrl(url);
};

const getRandomData = size => {
  const data = new Uint8Array(size);
  const grvMax = 64 * 1024; // https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues
  for (let offset = 0; offset < size; offset += grvMax) {
    crypto.getRandomValues(data.subarray(offset, offset + grvMax));
  }
  return data;
};

const getRandomSafeData = (n) => {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  return Array.from({ length: n }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
};

const startOrchestrator = async () => {
  statusEl.textContent = "Checking ⏰";
  statusEl.className = "status-checking";

  resultsBodyEl.replaceChildren();

  resultItems = {};
  verdictEl.className = "verdict verdict-hidden";

  try {
    const tasks = [];
    for (let t of testSuite) {
      tasks.push(checkDpi(
        t.id, t.provider, t.host, t.country,
        t.tier || TIER_OPTIONAL, t.hint || "", t.probe || "/"
      ));
    }

    await Promise.all(tasks);
    renderVerdict();
    statusEl.textContent = "Ready ⚡";
    statusEl.className = "status-ready";
  } catch (e) {
    statusEl.textContent = "Unexpected error ⚠️";
    logPush("ERR", null, `Unexpected error => ${e}`);
    statusEl.className = "status-error";
  }
  logPush("INFO", null, "Done.");
  toggleUI(false);
};

const handleDpiMethodErr = (alive, e) => {
  if (e.name === "AbortError") {
    if (alive) {
      return DPI_METHOD_DETECTED; // alive — ok, push — timeout
    }
    return DPI_METHOD_PROBABLY; // alive — instant error, push — timeout
  }
  if (alive) {
    return DPI_METHOD_POSSIBLE; // alive — ok, push — instant error
  }
  return DPI_METHOD_UNLIKELY; // alive — instant error, push — instant error
};

const dpiHugeBodyPostMethod = async (alive, host, probePath) => {
  try {
    const dpiCtrl = new AbortController();
    const dpiTimeoutId = setTimeout(() => dpiCtrl.abort(), timeoutMs);
    const opt = getDefaultFetchOpt(dpiCtrl, "POST")
    opt.body = getRandomData(DPI_THR_BYTES)
    const url = buildProbeUrl(host, probePath);
    await fetch(url, opt);
    clearTimeout(dpiTimeoutId);
  } catch (e) {
    return handleDpiMethodErr(alive, e);
  }

  return DPI_METHOD_NOT_DETECTED;
};

const dpiHugeReqlineHeadMethod = async (alive, host, probePath) => {
  try {
    const times = DPI_THR_BYTES / MAX_URI_X_SIZE;
    const dpiCtrl = new AbortController();
    const dpiTimeoutId = setTimeout(() => dpiCtrl.abort(), timeoutMs);
    for (let i = 0; i < times; i++) {
      const opt = getDefaultFetchOpt(dpiCtrl, "HEAD") // HEAD seems to be stable keep-alived 
      const url = buildProbeUrl(host, probePath, `x=${getRandomSafeData(MAX_URI_X_SIZE)}`);
      await fetch(url, opt);
    }
    clearTimeout(dpiTimeoutId);
  } catch (e) {
    return handleDpiMethodErr(alive, e);
  }

  return DPI_METHOD_NOT_DETECTED;
};

const assessEndpoint = (tier, alive, dpi) => {
  if (tier === TIER_META || tier === TIER_LOCAL) {
    return WORK_NA;
  }

  const dpiHardBlock = dpi === DPI_METHOD_DETECTED || dpi === DPI_METHOD_PROBABLY;

  if (alive === ALIVE_NO || dpiHardBlock) {
    return tier === TIER_OPTIONAL ? WORK_NA : WORK_FAIL;
  }

  if (alive === ALIVE_UNKNOWN || dpi === DPI_METHOD_UNLIKELY) {
    return tier === TIER_OPTIONAL ? WORK_NA : WORK_WARN;
  }

  if (dpi === DPI_METHOD_POSSIBLE) {
    return tier === TIER_CRITICAL ? WORK_WARN : WORK_OK;
  }

  return WORK_OK;
};

const setPrettyTier = (el, tier) => {
  el.textContent = TIER_LABELS[tier] || tier;
  el.className = `col-tier ${TIER_CELL_CLASS[tier] || ""}`;
};

const setPrettyWork = (el, work) => {
  const icons = {
    [WORK_OK]: "✅",
    [WORK_WARN]: "⚠️",
    [WORK_FAIL]: "❌",
    [WORK_NA]: "➖",
  };
  el.textContent = `${icons[work]} ${WORK_LABELS[work]}`;
  el.className = `col-work work-${work}`;
};

const renderVerdict = () => {
  const rows = testSuite
    .map((t) => {
      const r = resultItems[t.id];
      if (!r) return null;
      const alive = r[ALIVE_KEY];
      const dpi = r[DPI_METHOD_KEY] ?? DPI_METHOD_NOT_DETECTED;
      const tier = t.tier || TIER_OPTIONAL;
      const work = assessEndpoint(tier, alive, dpi);
      return { ...t, alive, dpi, tier, work };
    })
    .filter(Boolean);

  const critical = rows.filter((r) => r.tier === TIER_CRITICAL);
  const important = rows.filter((r) => r.tier === TIER_IMPORTANT);
  const criticalFails = critical.filter((r) => r.work === WORK_FAIL);
  const criticalWarns = critical.filter((r) => r.work === WORK_WARN);
  const importantFails = important.filter((r) => r.work === WORK_FAIL);
  const importantWarns = important.filter((r) => r.work === WORK_WARN);

  let level = "ok";
  let title = "Lovense должен работать";
  let text = "Все критичные домены доступны, признаков жёсткой блокировки DPI нет.";
  let icon = "✅";

  if (criticalFails.length > 0) {
    level = "bad";
    title = "Скорее всего будут проблемы";
    text = "Не доступны критичные зоны — Extension и OBS Toolset могут не подключаться к облаку или обрывать связь.";
    icon = "❌";
  } else if (criticalWarns.length > 0 || importantFails.length > 0) {
    level = "warn";
    title = "Скорее всего будет работать";
    text = "Основные сервисы в порядке, но есть предупреждения — возможны сбои переводов, логов или ложные срабатывания на VPN.";
    icon = "⚠️";
  } else if (importantWarns.length > 0) {
    level = "warn";
    title = "Должно работать с оговорками";
    text = "Критичные зоны в норме. Второстепенные сервисы под вопросом — на стрим это обычно не влияет.";
    icon = "⚠️";
  }

  verdictEl.className = `verdict verdict-${level}`;
  verdictIconEl.textContent = icon;
  verdictTitleEl.textContent = title;
  verdictTextEl.textContent = text;
  verdictDetailsEl.innerHTML = "";

  const addDetail = (label, items) => {
    if (!items.length) return;
    const li = document.createElement("li");
    li.innerHTML = `<b>${label}:</b> ${items.map((r) => `${r.country} ${r.provider}`).join(", ")}`;
    verdictDetailsEl.appendChild(li);
  };

  addDetail("Критичные — не работают", criticalFails);
  addDetail("Критичные — под вопросом", criticalWarns);
  addDetail("Важные — не работают", importantFails);
  addDetail("Важные — под вопросом", importantWarns);

  if (!criticalFails.length && !criticalWarns.length && !importantFails.length && !importantWarns.length) {
    const li = document.createElement("li");
    li.textContent = "Критичные и важные зоны прошли проверку.";
    verdictDetailsEl.appendChild(li);
  }
};

const checkDpi = async (id, provider, host, country, tier = TIER_OPTIONAL, hint = "", probe = "/") => {
  const prefix = `DPI checking(#${id})`;
  let t0 = performance.now();

  const row = resultsBodyEl.insertRow();
  row.dataset.tier = tier;
  const idCell = row.insertCell();
  const providerCell = row.insertCell();
  const tierCell = row.insertCell();
  const workCell = row.insertCell();
  const aliveStatusCell = row.insertCell();
  const dpiStatusCell = row.insertCell();

  let alive = false;
  let possibleAlive = false;

  idCell.textContent = id;
  resultItems[id] = {};
  setPrettyProvider(providerCell, provider, country);
  providerCell.title = [hint, probe && probe !== "/" ? `Проверка: ${probe}` : ""].filter(Boolean).join("\n");
  setPrettyTier(tierCell, tier);
  workCell.textContent = "Checking ⏰";
  workCell.className = "col-work";
  setStatus(aliveStatusCell, "Checking ⏰", "");
  setStatus(dpiStatusCell, "Waiting ⏰", "");

  try {
    // alive check
    const aliveCtrl = new AbortController();
    const aliveTimeoutId = setTimeout(() => aliveCtrl.abort(), timeoutMs);
    const url = buildProbeUrl(host, probe);
    await fetch(url, getDefaultFetchOpt(aliveCtrl, "HEAD"));
    clearTimeout(aliveTimeoutId);
    logPush("INFO", prefix, `alived: yes 🟢, reqtime: ${timeElapsed(t0)}`);
    resultItems[id][ALIVE_KEY] = ALIVE_YES;
    alive = true;
    possibleAlive = true;
  }
  catch (e) {
    console.log(e);
    if (e.name === "AbortError") {
      logPush("INFO", prefix, `alived: no 🔴, reqtime: ${timeElapsed(t0)}`);
      resultItems[id][ALIVE_KEY] = ALIVE_NO;
    } else {
      logPush("INFO", prefix, `alived: unknown ⚠️, reqtime: ${timeElapsed(t0)}`);
      resultItems[id][ALIVE_KEY] = ALIVE_UNKNOWN;
      possibleAlive = true;
    }
  }

  setPrettyAlive(aliveStatusCell, resultItems[id][ALIVE_KEY]);
  if (!alive && !possibleAlive) {
    setPrettyDpi(dpiStatusCell, ALIVE_NO, null); // -> skip
    resultItems[id][DPI_METHOD_KEY] = DPI_METHOD_NOT_DETECTED; // default value
    setPrettyWork(workCell, assessEndpoint(tier, resultItems[id][ALIVE_KEY], DPI_METHOD_NOT_DETECTED));
    return;
  }

  // dpi check
  setStatus(dpiStatusCell, "Checking ⏰", "");
  const m1 = await dpiHugeBodyPostMethod(alive, host, probe);
  if (m1 == DPI_METHOD_DETECTED) {
    logPush("INFO", prefix, `tcp 16-20: detected❗️, method: 1`);
    setPrettyDpi(dpiStatusCell, resultItems[id][ALIVE_KEY], m1);
    resultItems[id][DPI_METHOD_KEY] = DPI_METHOD_DETECTED;
    setPrettyWork(workCell, assessEndpoint(tier, resultItems[id][ALIVE_KEY], m1));
    return;
  }

  t0 = performance.now();
  const m2 = await dpiHugeReqlineHeadMethod(alive, host, probe);
  resultItems[id][DPI_METHOD_KEY] = m2;
  setPrettyDpi(dpiStatusCell, resultItems[id][ALIVE_KEY], m2);

  const logDpiMap = {
    [DPI_METHOD_DETECTED]: `tcp 16-20: detected❗️, method: 2`,
    [DPI_METHOD_PROBABLY]: `tcp 16-20: probably detected ⚠️, reqtime: ${timeElapsed(t0)}`,
    [DPI_METHOD_POSSIBLE]: `tcp 16-20: possible detected ⚠️, reqtime: ${timeElapsed(t0)}`,
    [DPI_METHOD_UNLIKELY]: `tcp 16-20: unlikely ⚠️, reqtime: ${timeElapsed(t0)}`,
    [DPI_METHOD_NOT_DETECTED]: `tcp 16-20: not detected ✅, reqtime: ${timeElapsed(t0)}`,
  }

  logPush("INFO", prefix, logDpiMap[m2]);
  setPrettyWork(workCell, assessEndpoint(tier, resultItems[id][ALIVE_KEY], m2));
};

const insertDebugRow = () => {
  const row = resultsBodyEl.insertRow();
  const idCell = row.insertCell();
  const providerCell = row.insertCell();
  const tierCell = row.insertCell();
  const workCell = row.insertCell();
  const aliveStatusCell = row.insertCell();
  const dpiStatusCell = row.insertCell();

  idCell.textContent = "XY.ABCD-01"
  providerCell.textContent = "🇺🇸 AbcdefQwerty"
  setPrettyTier(tierCell, TIER_CRITICAL);
  setPrettyWork(workCell, WORK_WARN);
  aliveStatusCell.textContent = "Checking ⏰"
  dpiStatusCell.textContent = "Checking ⏰"
}

const fetchAsnBasic = async (asn) => {
  const holder = (await (await fetch(RIPE_API_URL + "as-overview/data.json?resource=" + asn)).json()).data.holder;
  asnEl.innerHTML = `ASN: <a href="https://bgp.he.net/AS${asn}" target="_blank">AS${asn}</a> (<i>${holder}</i>)`;
};

const fetchAsn = async () => {
  try {
    const ip = (await (await fetch(RIPE_API_URL + "whats-my-ip/data.json")).json()).data.ip;
    const asn = (await (await fetch(RIPE_API_URL + "prefix-overview/data.json?resource=" + ip)).json()).data.asns[0];
    clientAsn = Number(asn.asn);
    const geo = (await (await fetch(RIPE_API_URL + "maxmind-geo-lite/data.json?resource=" + ip)).json()).data.located_resources[0].locations[0];
    asnEl.innerHTML = `ASN: <a href="https://bgp.he.net/AS${asn.asn}" target="_blank">AS${asn.asn}</a> (<i>${asn.holder}</i>)<span class="asn-br"></span>${geo.country}, ${geo.city || "—"}`;
  } catch (err) {
    console.error("Fetch ASN err:", err);
  }
};

const fetchSuite = async () => {
  try {
    testSuite = await (await fetch(getUniqueUrl("./suite.v2.json"))).json();
    startButtonEl.disabled = false;
  } catch {
    logPush("ERR", null, `Fetch suite failed. Probably a CORS issue (running locally?).`);
  }
};

const prettyTs = (ts) => {
  return ts.toISOString().slice(0, 16).replace('T', ' ');
}

const setPrettyProvider = (el, provider, country) => {
  el.textContent = `${country} ${provider}`;
};

const setPrettyDpi = (el, alive, dpi) => {
  if (alive == ALIVE_NO) {
    setStatus(el, "Skip ⚠️", "skip");
    return;
  }
  const m = {
    [DPI_METHOD_NOT_DETECTED]: () => setStatus(el, "No ✅", "ok"),
    [DPI_METHOD_DETECTED]: () => setStatus(el, "Detected❗️", "bad"),
    [DPI_METHOD_PROBABLY]: () => setStatus(el, "Probably❗️", "skip"),
    [DPI_METHOD_POSSIBLE]: () => setStatus(el, "Possible ⚠️", "skip"),
    [DPI_METHOD_UNLIKELY]: () => setStatus(el, "Unlikely ⚠️", "skip"),
  };
  m[dpi]();
};

const setPrettyAlive = (el, alive) => {
  const m = {
    [ALIVE_NO]: () => setStatus(el, "No 🔴", "bad"),
    [ALIVE_YES]: () => setStatus(el, "Yes 🟢", "ok"),
    [ALIVE_UNKNOWN]: () => setStatus(el, "Unknown ⚠️", "skip"),
  }
  m[alive]();
};

const renderShare = (share) => {
  shareTsEl.textContent = `Test timestamp: ${prettyTs(share.ts)}`;
  testSuite = share.items.map((v) => ({
    id: v.id,
    provider: v.provider,
    country: v.country,
    host: v.host,
    tier: v.tier || TIER_OPTIONAL,
    hint: v.hint || "",
    probe: v.probe || "/",
  }));
  for (let v of share.items) {
    const row = resultsBodyEl.insertRow();
    row.dataset.tier = v.tier || TIER_OPTIONAL;
    const idCell = row.insertCell();
    const providerCell = row.insertCell();
    const tierCell = row.insertCell();
    const workCell = row.insertCell();
    const aliveStatusCell = row.insertCell();
    const dpiStatusCell = row.insertCell();

    idCell.textContent = v.id;
    setPrettyProvider(providerCell, v.provider, v.country);
    providerCell.title = [v.hint, v.probe && v.probe !== "/" ? `Проверка: ${v.probe}` : ""].filter(Boolean).join("\n");
    setPrettyTier(tierCell, v.tier || TIER_OPTIONAL);
    setPrettyWork(workCell, assessEndpoint(v.tier || TIER_OPTIONAL, v.alive, v.dpi));
    setPrettyAlive(aliveStatusCell, v.alive);
    setPrettyDpi(dpiStatusCell, v.alive, v.dpi);
    resultItems[v.id] = { [ALIVE_KEY]: v.alive, [DPI_METHOD_KEY]: v.dpi };
  }
  renderVerdict();
};

// the contract should not be changed because it is used by historical functions
const rawImport = async (url) => {
  const res = await fetch(url);
  const code = await res.text();
  const blobUrl = URL.createObjectURL(
    new Blob([code], { type: 'text/javascript' })
  );
  return await import(blobUrl);
};

const tryHandleShare = async () => {
  const params = new URLSearchParams(window.location.search);
  const share = params.get("share");
  if (share) {
    const link = location.pathname;
    headerEl.innerHTML = `Want to try it too? Click <a href="${link}">here</a> ⚡`;
    headerEl.hidden = false;

    try {
      tableWrapEl.hidden = true;
      logEl.hidden = true;
      const buf = Uint8Array.fromBase64(share, { alphabet: "base64url" });
      const h = await import('./share/helpers.js');
      const commitHex = h.getCommitHex(buf);
      const relPath = "share/decoder.js";
      let decoderUrl = `https://raw.githubusercontent.com/${h.REPO}/${commitHex}/ru/lovense/${relPath}`;
      if (DEBUG) {
        decoderUrl = "./" + relPath;
      }

      const { decodeShare } = await rawImport(decoderUrl);
      const decoded = await decodeShare(h.REPO, commitHex, buf);
      fetchAsnBasic(decoded.asn);
      renderShare(decoded);
      tableWrapEl.hidden = false;
    }
    catch (e) {
      console.log(e);
      shareTsEl.hidden = true;
      asnEl.hidden = true;

      if (typeof Uint8Array.prototype.fromBase64 !== "function") {
        alert("To see the results, you need to update your browser.");
        return true;
      }
      alert("The results are out of date or internal error.");
    }
    return true;
  }
  return false;
};

startButtonEl.onclick = () => {
  logEl.textContent = "";
  toggleUI(true);
  localStorage.clear();
  sessionStorage.clear();
  startOrchestrator();
};

shareButtonEl.onclick = async () => {
  const prevContent = shareButtonEl.textContent;
  shareButtonEl.textContent = "🔗 ..."
  shareButtonEl.disabled = true;

  try {
    const encoded = await encodeShare(clientAsn, resultItems);
    const url = `${window.location.origin + window.location.pathname}?share=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Link to results copied to clipboard.");
    } catch {
      alert("Error writing to clipboard. Permissions granted?");
    }
  }
  catch {
    if (typeof Uint8Array.prototype.toBase64 !== "function") {
      alert("To share the results, you should update your browser.");
      return true;
    }

    alert("Error when encoding results.");
  }

  shareButtonEl.textContent = prevContent;
  shareButtonEl.disabled = false;
};

document.addEventListener("DOMContentLoaded", async () => {
  if (DEBUG) {
    console.log("debug mode: on");
    insertDebugRow();
  }

  if (await tryHandleShare()) {
    return;
  }

  fetchAsn();
  await fetchSuite();
  getParamsHandler();
});
