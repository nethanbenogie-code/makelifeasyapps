// js/core/license.js

// Your license validation server endpoint
const LIC_SRV = 'https://script.google.com/macros/s/AKfycby1QlCg9jzpXmxtE1N-5w7b4CuGa0TT5gcfwYrx-0yetL4iI5s86ZX8NyLhDwo4tLJX/exec';

// Optional: offline fallback for testing (remove in production)
const DEMO_FALLBACK_KEY = '3NA5-5N7I-HTF5-6T10';  // your key (only used if server unreachable)

function devId() {
  return btoa(navigator.userAgent.slice(-15) + screen.width + 'x' + screen.height + new Date().getTimezoneOffset())
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 16);
}

function isActiv() {
  return localStorage.getItem('mlea_activated') === 'true';
}

function setActiv(licenseKey, info) {
  localStorage.setItem('mlea_activated', 'true');
  localStorage.setItem('mlea_lic', licenseKey);
  if (info) localStorage.setItem('mlea_lic_info', JSON.stringify(info));
  showLicGate();
}

function clrActiv() {
  localStorage.removeItem('mlea_activated');
  localStorage.removeItem('mlea_lic');
  localStorage.removeItem('mlea_lic_info');
  showLicGate();
}

export function showLicGate() {
  const gate = document.getElementById('licenseGate');
  const login = document.getElementById('loginScreen');
  const main = document.getElementById('mainApp');
  if (!gate) return;

  if (isActiv()) {
    gate.style.display = 'none';
    login.style.display = 'flex';
    main.style.display = 'none';
    const s = document.getElementById('licStatus');
    if (s) {
      s.textContent = '✓ Activated';
      s.className = 'lic-status ok';
    }
    // If the login screen needs to be re‑rendered
    if (window.renderLogin) window.renderLogin();
  } else {
    gate.style.display = 'flex';
    login.style.display = 'none';
    main.style.display = 'none';
    const s = document.getElementById('licStatus');
    if (s) s.textContent = '';
  }
}

export async function initLicense() {
  const activateBtn = document.getElementById('activateBtn');
  const deactivateBtn = document.getElementById('deactivateBtn');
  const validateBtn = document.getElementById('validateBtn');
  const licenseInput = document.getElementById('licenseInput');

  if (!activateBtn) {
    console.warn('Activate button not found');
    return;
  }

  // Format license input as XXXX-XXXX-XXXX-XXXX
  if (licenseInput) {
    licenseInput.addEventListener('input', function () {
      let v = this.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (v.length > 16) v = v.slice(0, 16);
      const parts = [];
      for (let i = 0; i < v.length; i += 4) parts.push(v.slice(i, i + 4));
      this.value = parts.join('-');
    });
  }

  // --- Activate button handler ---
  window.doActivate = async () => {
    const key = licenseInput?.value.trim().toUpperCase() || '';
    const statusDiv = document.getElementById('licStatus');
    if (!key) {
      if (statusDiv) {
        statusDiv.textContent = '⚠️ Enter license key';
        statusDiv.className = 'lic-status err';
      }
      return;
    }

    activateBtn.disabled = true;
    if (statusDiv) {
      statusDiv.innerHTML = '<span class="spinner"></span> Verifying…';
      statusDiv.className = 'lic-status';
    }

    try {
      const response = await fetch(
        `${LIC_SRV}?action=activate&licenseKey=${encodeURIComponent(key)}&deviceId=${encodeURIComponent(devId())}`
      );
      const data = await response.json();
      if (data.success) {
        setActiv(key, { d: data.deviceCount, m: data.maxDevices });
        if (statusDiv) {
          statusDiv.textContent = `✓ Activated (Device ${data.deviceCount} of ${data.maxDevices})`;
          statusDiv.className = 'lic-status ok';
        }
      } else {
        if (statusDiv) {
          statusDiv.textContent = `✗ ${data.message}`;
          statusDiv.className = 'lic-status err';
        }
      }
    } catch (err) {
      console.warn('License server unreachable, using offline fallback (demo).', err);
      // Optional offline fallback – remove if you want strict online validation
      if (key === DEMO_FALLBACK_KEY) {
        setActiv(key);
        if (statusDiv) {
          statusDiv.textContent = '✓ Activated (offline mode)';
          statusDiv.className = 'lic-status ok';
        }
      } else {
        if (statusDiv) {
          statusDiv.textContent = '✗ Cannot reach license server';
          statusDiv.className = 'lic-status err';
        }
      }
    } finally {
      activateBtn.disabled = false;
    }
  };

  // --- Validate button handler ---
  window.doValidate = async () => {
    const key = localStorage.getItem('mlea_lic');
    const statusDiv = document.getElementById('licStatus');
    if (!key) {
      if (statusDiv) {
        statusDiv.textContent = 'No active license';
        statusDiv.className = 'lic-status err';
      }
      return;
    }
    if (statusDiv) {
      statusDiv.innerHTML = '<span class="spinner"></span> Checking…';
      statusDiv.className = 'lic-status';
    }
    try {
      const response = await fetch(
        `${LIC_SRV}?action=validate&licenseKey=${encodeURIComponent(key)}&deviceId=${encodeURIComponent(devId())}`
      );
      const data = await response.json();
      if (data.success) {
        statusDiv.textContent = `✓ Valid · Device ${data.deviceCount || '?'} of ${data.maxDevices || '?'}`;
        statusDiv.className = 'lic-status ok';
      } else {
        statusDiv.textContent = `✗ ${data.message}`;
        statusDiv.className = 'lic-status err';
      }
    } catch {
      statusDiv.textContent = 'Cannot reach license server';
      statusDiv.className = 'lic-status err';
    }
  };

  // --- Deactivate button handler ---
  window.doDeactivate = async () => {
    const key = localStorage.getItem('mlea_lic');
    if (!key) return;
    const ok = confirm('Deactivate this license on this device?');
    if (!ok) return;
    try {
      await fetch(
        `${LIC_SRV}?action=deactivate&licenseKey=${encodeURIComponent(key)}&deviceId=${encodeURIComponent(devId())}`
      );
    } catch {}
    clrActiv();
  };

  // Attach events to buttons
  activateBtn.onclick = window.doActivate;
  if (deactivateBtn) deactivateBtn.onclick = window.doDeactivate;
  if (validateBtn) validateBtn.onclick = window.doValidate;

  // Show the correct UI (license gate or login)
  showLicGate();
}