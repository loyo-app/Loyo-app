/* =====================================================================
   LOYO — LOYALTY CARD
   ---------------------------------------------------------------------
   No database yet: everything is saved with localStorage, so a
   customer's stamp count lives on whatever phone/browser they check in
   with. That's fine for a single-chair MVP tested on real customers,
   but it does NOT sync across devices and clears if someone clears
   their browser data.

   WHEN YOU ADD A REAL DATABASE LATER:
   Everything that reads/writes customer data goes through the `Store`
   object below. Replace the inside of each Store method with a fetch()
   call to your API/Firebase/Supabase, keep the same method names and
   return shapes, and the rest of this file (all the UI logic) does not
   need to change.
   ===================================================================== */

const CONFIG = {
  STAMPS_REQUIRED: 8,     // stamps needed for a free haircut
  STAFF_PIN: "2468",      // change this! anyone who knows it can add stamps.
};

// A link containing ?stamp=1 (what the shop's QR code should point to)
// grants one stamp automatically after login — capped at once per day
// per phone number so refreshing or rescanning doesn't stack stamps.
const AUTO_STAMP_REQUESTED = new URLSearchParams(window.location.search).get("stamp") === "1";

/* ---------------------------------------------------------------------
   Store: swap this out for real API calls once you have a database.
   ------------------------------------------------------------------- */
const Store = {
  key(phone) {
    return `loyo:customer:${phone}`;
  },
  getCustomer(phone) {
    const raw = localStorage.getItem(this.key(phone));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  saveCustomer(customer) {
    localStorage.setItem(this.key(customer.phone), JSON.stringify(customer));
  },
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

function scissorsSVG() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle>
    <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
    <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
    <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
  </svg>`;
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
  for (let i = 0; i < CONFIG.STAMPS_REQUIRED; i++) {
    const filled = i < customer.stamps;
    const div = document.createElement("div");
    div.className = "stamp" + (filled ? " filled" : "");
    div.innerHTML = scissorsSVG();
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
function tryAutoStamp(customer) {
  if (!AUTO_STAMP_REQUESTED) return customer;

  const today = todayLabel();
  if (customer.lastAutoStamp === today) {
    showCheckinNote("You're already checked in for today — see you next visit!", "info");
    return customer;
  }

  customer.stamps = Math.min(customer.stamps + 1, CONFIG.STAMPS_REQUIRED);
  customer.lastAutoStamp = today;
  customer.history.push({ type: "stamp", date: today });
  Store.saveCustomer(customer);
  showCheckinNote("Stamp added — thanks for checking in!", "success");
  return customer;
}

/* ---------------------------------------------------------------------
   Login flow
   ------------------------------------------------------------------- */
function loginWithPhone(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (phone.length < 7) {
    phoneInput.focus();
    return;
  }
  currentPhone = phone;
  Store.setLastPhone(phone);

  let customer = Store.getCustomer(phone);
  if (!customer) {
    customer = { phone, stamps: 0, history: [], createdAt: todayLabel() };
    Store.saveCustomer(customer);
  }
  hideCheckinNote();
  customer = tryAutoStamp(customer);
  showProfile(customer);
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  loginWithPhone(phoneInput.value);
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

pinConfirm.addEventListener("click", () => {
  if (pinInput.value !== CONFIG.STAFF_PIN) {
    pinError.classList.remove("hidden");
    pinInput.value = "";
    pinInput.focus();
    return;
  }
  const customer = Store.getCustomer(currentPhone);
  if (!customer) { closePinModal(); return; }

  if (pendingAction === "stamp") {
    customer.stamps = Math.min(customer.stamps + 1, CONFIG.STAMPS_REQUIRED);
    customer.history.push({ type: "stamp", date: todayLabel() });
  } else if (pendingAction === "redeem") {
    customer.stamps = 0;
    customer.history.push({ type: "redeem", date: todayLabel() });
  }
  Store.saveCustomer(customer);
  closePinModal();
  showProfile(customer);
});

pinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") pinConfirm.click();
});

/* ---------------------------------------------------------------------
   Boot: auto-resume last checked-in number on this device
   ------------------------------------------------------------------- */
(function init() {
  const last = Store.getLastPhone();
  if (last) {
    let customer = Store.getCustomer(last);
    if (customer) {
      currentPhone = last;
      customer = tryAutoStamp(customer);
      showProfile(customer);
      return;
    }
  }
  showLogin();
})();
