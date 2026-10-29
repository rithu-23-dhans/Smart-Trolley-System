"use strict";

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

// STEP 1: Replace these placeholder values with your Firebase config.
const firebaseConfig = {
  apiKey: "AIzaSyBopeMg11GFQmiAHAhRLkKJePRwu13DOkE",
  authDomain: "smart-trolley-4f690.firebaseapp.com",
  projectId: "smart-trolley-4f690",
  storageBucket: "smart-trolley-4f690.firebasestorage.app",
  messagingSenderId: "954451799536",
  appId: "1:954451799536:web:66f28959ac28fe2a634135",
  measurementId: "G-Y1KJWREF2W"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const products = {};
const cart = {};

const readerElement = document.getElementById("reader");
const startButton = document.getElementById("startScan");
const stopButton = document.getElementById("stopScan");
const barcodeInput = document.getElementById("barcodeInput");
const message = document.getElementById("scanMessage");

const productForm = document.getElementById("productForm");
const newBarcode = document.getElementById("newBarcode");
const newName = document.getElementById("newName");
const newPrice = document.getElementById("newPrice");
const newWeight = document.getElementById("newWeight");
const registerMessage = document.getElementById("registerMessage");

let scanner = null;
let scannerRunning = false;
let processingScan = false;
let scanGeneration = 0;
let databaseReady = false;

// Sample products: these are added online only if the barcode
// doesn't already exist in Firestore.
const sampleProducts = {
  "8901000000001": {
    name: "Bath Soap", price: 38, weight: 100, icon: "🧼"
  },
  "8901000000002": {
    name: "Rice Packet", price: 60, weight: 500, icon: "🍚"
  },
  "8901000000003": {
    name: "Biscuit Packet", price: 20, weight: 100, icon: "🍪"
  },
  "8901000000004": {
    name: "Milk Packet", price: 30, weight: 250, icon: "🥛"
  },
  "8901000000005": {
    name: "Cooking Oil", price: 120, weight: 500, icon: "🫗"
  },
  "8901000000006": {
    name: "Sugar Packet", price: 45, weight: 500, icon: "🍬"
  },
  "8901000000007": {
    name: "Noodles", price: 15, weight: 70, icon: "🍜"
  },
  "8901000000008": {
    name: "Shampoo", price: 85, weight: 180, icon: "🧴"
  },
  "8901000000009": {
    name: "Chips Packet", price: 20, weight: 50, icon: "🥔"
  },
  "8901000000010": {
    name: "Chocolate", price: 25, weight: 40, icon: "🍫"
  }
};

function showMessage(text) {
  message.textContent = text;
}

function updateButtons(running) {
  startButton.hidden = running;
  stopButton.hidden = !running;
}

function getProductRef(barcode) {
  return doc(db, "products", barcode);
}

// Sign in and load products from the online database.
async function initializeDatabase() {
  try {
    showMessage("Connecting to the online product database...");

    await signInAnonymously(auth);

    // Add the sample products only when they are missing.
    for (const [barcode, product] of Object.entries(sampleProducts)) {
      const productRef = getProductRef(barcode);
      const existing = await getDoc(productRef);

      if (!existing.exists()) {
        await setDoc(productRef, { ...product, barcode });
      }
    }

    // Load the sample and registered products into this browser.
    for (const barcode of Object.keys(sampleProducts)) {
      const snapshot = await getDoc(getProductRef(barcode));
      if (snapshot.exists()) {
        products[barcode] = snapshot.data();
      }
    }

    databaseReady = true;
    showMessage("Online database connected. Ready to scan!");
  } catch (error) {
    console.error("Database connection error:", error);
    showMessage(
      "Could not connect to Firebase. Check your Firebase config, " +
      "Anonymous Authentication and Firestore rules. " + error.message
    );
  }
}

async function addProduct(rawBarcode) {
  const barcode = String(rawBarcode || "").trim();

  if (!barcode) {
    showMessage("Please scan or enter a barcode.");
    return false;
  }

  if (!databaseReady) {
    showMessage("Please wait for the online database to connect.");
    return false;
  }

  let product = products[barcode];

  // If not in memory, check the online database.
  if (!product) {
    try {
      const snapshot = await getDoc(getProductRef(barcode));

      if (snapshot.exists()) {
        product = snapshot.data();
        products[barcode] = product;
      }
    } catch (error) {
      console.error("Product lookup error:", error);
      showMessage("Could not look up this barcode online.");
      return false;
    }
  }

  if (!product) {
    newBarcode.value = barcode;
    barcodeInput.value = barcode;
    showMessage(
      `Unknown barcode: ${barcode}. Enter its details in Register New Product.`
    );
    registerMessage.textContent =
      "Barcode entered. Fill in the product name, price and weight.";
   document.querySelector(".register-product")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
    return false;
  }

  if (cart[barcode]) {
    cart[barcode].quantity += 1;
  } else {
    cart[barcode] = {
      ...product,
      barcode,
      quantity: 1
    };
  }

  barcodeInput.value = "";
  renderCart();
  showMessage(`${product.name} added successfully!`);
  return true;
}

// Register a new barcode in the shared online database.
productForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const barcode = newBarcode.value.trim();
  const name = newName.value.trim();
  const price = Number(newPrice.value);
  const weight = Number(newWeight.value);

  if (!barcode || !name || !Number.isFinite(price) ||
      price <= 0 || !Number.isFinite(weight) || weight <= 0) {
    registerMessage.textContent =
      "Enter a barcode, product name, positive price and positive weight.";
    return;
  }

  if (!databaseReady || !auth.currentUser) {
    registerMessage.textContent =
      "The online database isn't ready. Please wait and try again.";
    return;
  }

  const saveButton = document.getElementById("saveProduct");
  saveButton.disabled = true;
  registerMessage.textContent = "Saving product online...";

  const product = {
    name,
    price,
    weight,
    icon: "🛒",
    barcode
  };

  try {
    const productRef = getProductRef(barcode);
    const existing = await getDoc(productRef);

    if (existing.exists()) {
      registerMessage.textContent =
        "This barcode is already registered. Use its existing product entry.";
      return;
    }

    await setDoc(productRef, product);
    products[barcode] = product;

    registerMessage.textContent =
      `${name} saved online! You can scan it on another device using this website.`;

    productForm.reset();
    barcodeInput.value = "";
    showMessage(`${name} registered successfully!`);
  } catch (error) {
    console.error("Product save error:", error);
    registerMessage.textContent =
      "Could not save the product. Check your internet and Firebase rules.";
  } finally {
    saveButton.disabled = false;
  }
});

function renderCart() {
  const cartItems = document.getElementById("cartItems");
  const itemCount = document.getElementById("itemCount");
  const cartTotal = document.getElementById("cartTotal");

  cartItems.replaceChildren();

  const entries = Object.values(cart);
  const totalQuantity = entries.reduce(
    (sum, item) => sum + item.quantity, 0
  );
  const totalPrice = entries.reduce(
    (sum, item) => sum + item.price * item.quantity, 0
  );

  itemCount.textContent =
    `${totalQuantity} ${totalQuantity === 1 ? "item" : "items"}`;
  cartTotal.textContent = `₹${totalPrice.toFixed(2)}`;

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-cart";

    const icon = document.createElement("span");
    icon.textContent = "🛍️";

    const title = document.createElement("p");
    title.textContent = "Your cart is empty";

    const hint = document.createElement("small");
    hint.textContent = "Scan a product to get started.";

    empty.append(icon, title, hint);
    cartItems.appendChild(empty);
    return;
  }

  entries.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-item";

    const icon = document.createElement("div");
    icon.className = "product-icon";
    icon.textContent = item.icon || "🛒";

    const info = document.createElement("div");
    info.className = "product-info";

    const name = document.createElement("strong");
    name.textContent = item.name;

    const details = document.createElement("small");
    details.textContent =
      `₹${item.price} each · ${item.weight} g · Qty: ${item.quantity}`;

    info.append(name, details);

    const priceArea = document.createElement("div");
    priceArea.className = "product-price";
    priceArea.textContent =
      `₹${(item.price * item.quantity).toFixed(2)}`;

    const removeButton = document.createElement("button");
    removeButton.className = "remove-button";
    removeButton.type = "button";
    removeButton.textContent = "Remove one";

    removeButton.addEventListener("click", () => {
      if (item.quantity > 1) {
        item.quantity -= 1;
      } else {
        delete cart[item.barcode];
      }

      renderCart();
      showMessage(`${item.name} cart quantity updated.`);
    });

    priceArea.appendChild(removeButton);
    row.append(icon, info, priceArea);
    cartItems.appendChild(row);
  });
}

