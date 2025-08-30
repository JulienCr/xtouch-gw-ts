// gamepad-hid.js
const HID = require("node-hid");

// MODIF: Add CLI arg support to select a specific device index (e.g., `node gamepad-hid.js 12`)
const cliIndex = Number.isInteger(parseInt(process.argv[2], 10)) ? parseInt(process.argv[2], 10) : null;

// List all HID devices
const devices = HID.devices();
console.log("=== HID Devices ===");
devices.forEach((d, i) => {
  console.log(`${i}: ${d.product || "(unknown)"} [${d.vendorId}:${d.productId}]`);
});

// MODIF: Prefer explicit index; fallback to heuristics (your controller 3695:384 or product name)
let deviceInfo = null;
if (cliIndex !== null) {
  deviceInfo = devices[cliIndex] || null;
} else {
  deviceInfo =
    devices.find(d => d.vendorId === 3695 && d.productId === 384) ||
    devices.find(d => /faceoff|nintendo|switch|pro\s*controller/i.test(d.product || "")) ||
    devices.find(d => /gamepad|controller|joystick/i.test(d.product || ""));
}

if (!deviceInfo) {
  console.error("❌ No suitable gamepad HID device found (try: node gamepad-hid.js 12)");
  process.exit(1);
}

console.log("🎮 Opening device:", deviceInfo);

let device;
try {
  // MODIF: On Windows, prefer `path`; on other OS, vendorId/productId may be used
  device = new HID.HID(deviceInfo.path);
} catch (err) {
  console.error("❌ HID open error:", err);
  process.exit(1);
}

// MODIF: Print raw reports; many Switch/DirectInput pads send 8–64 bytes per report
device.on("data", (data) => {
  console.log("HID report:", data.toString("hex"));
});

// MODIF: Robust error handling (disconnects, permission issues)
device.on("error", (err) => {
  console.error("Device error:", err);
  process.exit(1);
});
