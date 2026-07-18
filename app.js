/* =====================================================================
   LOYO — LOYALTY CARD
   ---------------------------------------------------------------------
   Customer data now lives in Supabase (see the `Store` object below),
   shared across every device. The staff PIN check still happens in
   this file only — so it's a convenience gate, not real security. The
   `customers` table's Row Level Security policies are wide open (see
   README), meaning the true security here is "nobody goes looking,"
   not "nobody can." Good enough for a pilot; add phone verification
   or a server-side Edge Function before this is bulletproof.
   ===================================================================== */

const CONFIG = {
  STAMPS_REQUIRED: 9,     // stamps needed before the 10th-visit free haircut
  STAFF_PIN: "2468",      // change this! anyone who knows it can add stamps.
};

// ---- Supabase connection: fill these in from Project Settings > API ----
const SUPABASE_URL = "https://tgnlmlaqhfhmahwrvvkn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnbmxtbGFxaGZobWFod3J2dmtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNTcwNTYsImV4cCI6MjA5OTkzMzA1Nn0.u0ku6U6fGAaB0r4PkCe65nzteh_KpFWDE3NXN1r4Lcs";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// A link containing ?stamp=1 (what the shop's QR code should point to)
// grants one stamp automatically after login — capped at once per day
// per phone number so refreshing or rescanning doesn't stack stamps.
const AUTO_STAMP_REQUESTED = new URLSearchParams(window.location.search).get("stamp") === "1";

/* ---------------------------------------------------------------------
   Store: all reads/writes to customer data go through here.
   ------------------------------------------------------------------- */
const Store = {
  async getCustomer(phone) {
    const { data, error } = await sb.from("customers").select("*").eq("phone", phone).maybeSingle();
    if (error) { console.error("Supabase getCustomer error:", error); throw error; }
    if (!data) return null;
    return {
      phone: data.phone,
      stamps: data.stamps,
      history: data.history || [],
      lastAutoStamp: data.last_auto_stamp,
    };
  },
  async saveCustomer(customer) {
    const { error } = await sb.from("customers").upsert({
      phone: customer.phone,
      stamps: customer.stamps,
      history: customer.history,
      last_auto_stamp: customer.lastAutoStamp || null,
    });
    if (error) { console.error("Supabase saveCustomer error:", error); throw error; }
  },
  // Which phone number this device last used — purely a local convenience
  // for auto-filling/resuming a session, not the source of truth.
  getLastPhone() {
    return localStorage.getItem("loyo:lastPhone");
  },
  setLastPhone(phone) {
    localStorage.setItem("loyo:lastPhone", phone);
  },
  clearLastPhone() {
    localStorage.removeItem("loyo:lastPhone");
  },
};

/* ---------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------- */
function normalizePhone(input) {
  return input.replace(/\D/g, "");
}

function formatPhone(digits) {
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return digits;
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function scissorsSVG() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle>
    <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
    <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
    <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
  </svg>`;
}

function showError(err) {
  console.error(err);
  alert("Couldn't reach the database. Check your connection and try again.");
}

/* ---------------------------------------------------------------------
   State
   ------------------------------------------------------------------- */
let currentPhone = null;
let pendingAction = null; // "stamp" | "redeem"

/* ---------------------------------------------------------------------
   DOM refs
   ------------------------------------------------------------------- */
const loginView = document.getElementById("login-view");
const profileView = document.getElementById("profile-view");
const checkinNote = document.getElementById("checkin-note");
const loginForm = document.getElementById("login-form");
const loginBtn = loginForm.querySelector("button");
const phoneInput = document.getElementById("phone-input");
const profilePhoneEl = document.getElementById("profile-phone");
const stampsGrid = document.getElementById("stamps-grid");
const progressText = document.getElementById("progress-text");
const redeemBtn = document.getElementById("redeem-btn");
const historyList = document.getElementById("history-list");
const logoutBtn = document.getElementById("logout-btn");
const staffToggle = document.getElementById("staff-toggle");

const pinModal = document.getElementById("pin-modal");
const pinTitle = document.getElementById("pin-title");
const pinInput = document.getElementById("pin-input");
const pinError = document.getElementById("pin-error");
const pinCancel = document.getElementById("pin-cancel");
const pinConfirm = document.getElementById("pin-confirm");

/* ---------------------------------------------------------------------
   Rendering
   ------------------------------------------------------------------- */
function showLogin() {
  loginView.classList.remove("hidden");
  profileView.classList.add("hidden");
  phoneInput.value = "";
  phoneInput.focus();
}

function showProfile(customer) {
  loginView.classList.add("hidden");
  profileView.classList.remove("hidden");
  profilePhoneEl.textContent = formatPhone(customer.phone);

  stampsGrid.innerHTML = "";
  const totalSlots = CONFIG.STAMPS_REQUIRED + 1; // regular stamps + the free-haircut slot
  for (let i = 0; i < totalSlots; i++) {
    const div = document.createElement("div");
    if (i < CONFIG.STAMPS_REQUIRED) {
      const filled = i < customer.stamps;
      div.className = "stamp" + (filled ? " filled" : "");
      div.innerHTML = scissorsSVG();
    } else {
      const earned = customer.stamps >= CONFIG.STAMPS_REQUIRED;
      div.className = "stamp reward" + (earned ? " filled" : "");
      div.innerHTML = `<span class="reward-text">FREE<br>HAIRCUT</span>`;
    }
    stampsGrid.appendChild(div);
  }

  const remaining = CONFIG.STAMPS_REQUIRED - customer.stamps;
  if (remaining <= 0) {
    progressText.textContent = "Ready to redeem — free haircut earned!";
    redeemBtn.classList.remove("hidden");
  } else {
    progressText.textContent = `${customer.stamps} of ${CONFIG.STAMPS_REQUIRED} stamps — ${remaining} more for a free cut`;
    redeemBtn.classList.add("hidden");
  }

  renderHistory(customer);
}

function renderHistory(customer) {
  const items = [...(customer.history || [])].reverse().slice(0, 8);
  if (items.length === 0) {
    historyList.innerHTML = `<li class="empty-note">No visits yet — your first stamp shows up here.</li>`;
    return;
  }
  historyList.innerHTML = items.map(h => `
    <li>
      <span>${h.date}</span>
      <span class="tag${h.type === "redeem" ? " redeem" : ""}">${h.type === "redeem" ? "Redeemed" : "Stamp"}</span>
    </li>
  `).join("");
}

function showCheckinNote(message, kind) {
  checkinNote.textContent = message;
  checkinNote.className = `checkin-note ${kind}`;
  checkinNote.classList.remove("hidden");
}

function hideCheckinNote() {
  checkinNote.classList.add("hidden");
}

/* ---------------------------------------------------------------------
   Auto-stamp from the QR link (?stamp=1), capped once per day/phone
   ------------------------------------------------------------------- */
async function tryAutoStamp(customer) {
  if (!AUTO_STAMP_REQUESTED) return customer;

  const today = todayISO();
  if (customer.lastAutoStamp === today) {
    showCheckinNote("You're already checked in for today — see you next visit!", "info");
    return customer;
  }

  customer.stamps = Math.min(customer.stamps + 1, CONFIG.STAMPS_REQUIRED);
  customer.lastAutoStamp = today;
  customer.history.push({ type: "stamp", date: todayLabel() });
  await Store.saveCustomer(customer);
  showCheckinNote("Stamp added — thanks for checking in!", "success");
  return customer;
}

/* ---------------------------------------------------------------------
   Login flow
   ------------------------------------------------------------------- */
async function loginWithPhone(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (phone.length < 7) {
    phoneInput.focus();
    return;
  }
  currentPhone = phone;
  Store.setLastPhone(phone);

  let customer = await Store.getCustomer(phone);
  if (!customer) {
    customer = { phone, stamps: 0, history: [], lastAutoStamp: null };
    await Store.saveCustomer(customer);
  }
  hideCheckinNote();
  customer = await tryAutoStamp(customer);
  showProfile(customer);
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginBtn.disabled = true;
  loginBtn.textContent = "Loading…";
  try {
    await loginWithPhone(phoneInput.value);
  } catch (err) {
    showError(err);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Continue";
  }
});

logoutBtn.addEventListener("click", () => {
  currentPhone = null;
  Store.clearLastPhone();
  showLogin();
});

/* ---------------------------------------------------------------------
   Staff actions (PIN-gated)
   ------------------------------------------------------------------- */
staffToggle.addEventListener("click", () => openPinModal("stamp"));
redeemBtn.addEventListener("click", () => openPinModal("redeem"));

function openPinModal(action) {
  pendingAction = action;
  pinTitle.textContent = action === "redeem" ? "Confirm redemption" : "Enter staff PIN to add a stamp";
  pinInput.value = "";
  pinError.classList.add("hidden");
  pinModal.classList.remove("hidden");
  pinInput.focus();
}

function closePinModal() {
  pinModal.classList.add("hidden");
  pendingAction = null;
}

pinCancel.addEventListener("click", closePinModal);

pinConfirm.addEventListener("click", async () => {
  if (pinInput.value !== CONFIG.STAFF_PIN) {
    pinError.classList.remove("hidden");
    pinInput.value = "";
    pinInput.focus();
    return;
  }

  pinConfirm.disabled = true;
  try {
    const customer = await Store.getCustomer(currentPhone);
    if (!customer) { closePinModal(); return; }

    if (pendingAction === "stamp") {
      customer.stamps = Math.min(customer.stamps + 1, CONFIG.STAMPS_REQUIRED);
      customer.history.push({ type: "stamp", date: todayLabel() });
    } else if (pendingAction === "redeem") {
      customer.stamps = 0;
      customer.history.push({ type: "redeem", date: todayLabel() });
    }
    await Store.saveCustomer(customer);
    closePinModal();
    showProfile(customer);
  } catch (err) {
    showError(err);
  } finally {
    pinConfirm.disabled = false;
  }
});

pinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") pinConfirm.click();
});

/* ---------------------------------------------------------------------
   Boot: auto-resume last checked-in number on this device
   ------------------------------------------------------------------- */
(async function init() {
  const last = Store.getLastPhone();
  if (last) {
    try {
      let customer = await Store.getCustomer(last);
      if (customer) {
        currentPhone = last;
        customer = await tryAutoStamp(customer);
        showProfile(customer);
        return;
      }
    } catch (err) {
      showError(err);
    }
  }
  showLogin();
})();
